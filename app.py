import os
import uuid
import math
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from config import PORT, SECRET_KEY, CORS_ORIGIN
from database import init_db, get_connection, dict_from_row, dict_from_rows, get_all_sheet_names
from excel_sync import enqueue_sync, get_sync_status

app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = SECRET_KEY
CORS(app, resources={r"/api/*": {"origins": CORS_ORIGIN}})

init_db()

SEARCHABLE_COLS = [
    "equipamento", "marca", "modelo", "owner", "patrimonio",
    "service_tag", "hostname", "localidade", "usuario", "cargo",
    "area", "contrato", "observacoes"
]

SORTABLE_COLS = {
    "equipamento": "equipamento",
    "marca": "marca",
    "modelo": "modelo",
    "usuario": "usuario",
    "localidade": "localidade",
    "patrimonio": "patrimonio",
    "owner": "owner",
    "contrato": "contrato",
    "vencimento_garantia": "vencimento_garantia",
    "atualizado_em": "atualizado_em",
    "sheet_name": "sheet_name",
}

# --- ROTAS DE ABAS (SHEETS) ---

@app.route("/api/sheets", methods=["GET"])
def list_sheets():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT name, display_name, position FROM sheets ORDER BY position")
    rows = dict_from_rows(cursor.fetchall())
    conn.close()
    return jsonify(rows)

@app.route("/api/sheets", methods=["POST"])
def create_sheet():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    display_name = str(data.get("display_name", name)).strip()

    if not name:
        return jsonify({"error": "Nome da aba é obrigatório"}), 400

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM sheets WHERE name = ?", (name,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"error": f"Já existe uma aba chamada '{name}'"}), 409

    cursor.execute("SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM sheets")
    next_pos = cursor.fetchone()["next_pos"]
    cursor.execute(
        "INSERT INTO sheets (name, display_name, position) VALUES (?, ?, ?)",
        (name, display_name or name, next_pos)
    )
    conn.commit()
    conn.close()

    enqueue_sync()
    return jsonify({"name": name, "display_name": display_name or name}), 201

@app.route("/api/sheets/<sheet_name>", methods=["PUT"])
def rename_sheet(sheet_name):
    data = request.get_json(silent=True) or {}
    new_display = str(data.get("display_name", "")).strip()
    new_name = str(data.get("name", "")).strip()

    if not new_display and not new_name:
        return jsonify({"error": "Forneça novo nome ou novo rótulo"}), 400

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM sheets WHERE name = ?", (sheet_name,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "Aba não encontrada"}), 404

    if new_name and new_name != sheet_name:
        cursor.execute("SELECT id FROM sheets WHERE name = ?", (new_name,))
        if cursor.fetchone():
            conn.close()
            return jsonify({"error": f"Já existe uma aba chamada '{new_name}'"}), 409

    try:
        if new_name and new_name != sheet_name:
            cursor.execute("PRAGMA foreign_keys = OFF")
            cursor.execute("UPDATE ativos SET sheet_name = ? WHERE sheet_name = ?", (new_name, sheet_name))
            cursor.execute("UPDATE sheets SET name = ? WHERE name = ?", (new_name, sheet_name))
            cursor.execute("PRAGMA foreign_keys = ON")
        if new_display:
            target = new_name or sheet_name
            cursor.execute("UPDATE sheets SET display_name = ? WHERE name = ?", (new_display, target))
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(e)}), 500
    conn.close()

    enqueue_sync()
    return jsonify({"ok": True})

@app.route("/api/sheets/<sheet_name>", methods=["DELETE"])
def delete_sheet(sheet_name):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM sheets WHERE name = ?", (sheet_name,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "Aba não encontrada"}), 404

    # Remove a aba e todos os registros vinculados (cascade via foreign key)
    cursor.execute("PRAGMA foreign_keys = ON")
    cursor.execute("DELETE FROM ativos WHERE sheet_name = ?", (sheet_name,))
    cursor.execute("DELETE FROM sheets WHERE name = ?", (sheet_name,))
    conn.commit()
    conn.close()

    enqueue_sync()
    return "", 204

# --- FILTROS ---

@app.route("/api/filters", methods=["GET"])
def get_filters():
    sheet = request.args.get("sheet", "Ativos")
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT DISTINCT owner FROM ativos WHERE sheet_name = ? AND owner IS NOT NULL AND owner != '' ORDER BY owner",
        (sheet,)
    )
    owners = [r["owner"] for r in cursor.fetchall()]

    cursor.execute(
        "SELECT DISTINCT contrato FROM ativos WHERE sheet_name = ? AND contrato IS NOT NULL AND contrato != '' ORDER BY contrato",
        (sheet,)
    )
    contratos = [r["contrato"] for r in cursor.fetchall()]

    cursor.execute(
        "SELECT DISTINCT localidade FROM ativos WHERE sheet_name = ? AND localidade IS NOT NULL AND localidade != '' ORDER BY localidade",
        (sheet,)
    )
    localidades = [r["localidade"] for r in cursor.fetchall()]

    conn.close()
    return jsonify({"owners": owners, "contratos": contratos, "localidades": localidades})

# --- ATIVOS ---

@app.route("/api/ativos", methods=["GET"])
def list_ativos():
    sheet = request.args.get("sheet", "Ativos")
    global_search = request.args.get("global", "0") == "1"
    q = request.args.get("q", "").strip()
    owner = request.args.get("owner", "").strip()
    contrato = request.args.get("contrato", "").strip()
    localidade = request.args.get("localidade", "").strip()

    page = max(1, int(request.args.get("page", 1)))
    page_size = min(200, max(1, int(request.args.get("pageSize", 50))))
    sort_by_key = request.args.get("sortBy", "atualizado_em")
    sort_dir = request.args.get("sortDir", "desc").lower()

    if sort_dir not in ("asc", "desc"):
        sort_dir = "desc"
    sort_col = SORTABLE_COLS.get(sort_by_key, "atualizado_em")

    where = ["deletado = 0"]
    params = []

    # Busca global ignora o filtro de aba; busca normal filtra por aba
    if not global_search:
        where.append("sheet_name = ?")
        params.append(sheet)

    # Filtros avançados só se aplicam quando não é busca global (contexto de aba)
    if not global_search:
        if owner:
            where.append("owner = ?")
            params.append(owner)
        if contrato:
            where.append("contrato = ?")
            params.append(contrato)
        if localidade:
            where.append("localidade = ?")
            params.append(localidade)

    if q:
        sub_clauses = [f"{col} LIKE ?" for col in SEARCHABLE_COLS]
        where.append(f"({' OR '.join(sub_clauses)})")
        params.extend([f"%{q}%"] * len(SEARCHABLE_COLS))

    where_clause = " WHERE " + " AND ".join(where)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(f"SELECT COUNT(*) as n FROM ativos {where_clause}", params)
    total = cursor.fetchone()["n"]

    offset = (page - 1) * page_size
    query = f"SELECT * FROM ativos {where_clause} ORDER BY {sort_col} {sort_dir.upper()} LIMIT ? OFFSET ?"
    cursor.execute(query, params + [page_size, offset])
    rows = dict_from_rows(cursor.fetchall())
    conn.close()

    total_pages = math.ceil(total / page_size) if total > 0 else 1
    return jsonify({
        "data": rows,
        "pagination": {"page": page, "pageSize": page_size, "total": total, "totalPages": total_pages}
    })

@app.route("/api/ativos/<ativo_id>", methods=["GET"])
def get_ativo(ativo_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM ativos WHERE id = ? AND deletado = 0", (ativo_id,))
    row = dict_from_row(cursor.fetchone())
    conn.close()
    if not row:
        return jsonify({"error": "Ativo não encontrado"}), 404
    return jsonify({"data": row})

@app.route("/api/ativos", methods=["POST"])
def create_ativo():
    data = request.get_json(silent=True) or {}
    ativo_id = str(uuid.uuid4())
    sheet_name = data.get("sheet_name", "Ativos")

    # Valida se a aba existe
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM sheets WHERE name = ?", (sheet_name,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": f"Aba '{sheet_name}' não existe"}), 400

    fields = [
        "equipamento", "marca", "modelo", "memoria", "hd", "polegadas",
        "owner", "patrimonio", "service_tag", "hostname", "localidade",
        "andar", "sigla", "usuario", "cargo", "area", "aquisicao",
        "vencimento_garantia", "observacoes", "contrato", "inicio_contrato",
        "vencimento_contrato", "linha_atualizada_em", "baixa_em"
    ]

    record = {"id": ativo_id, "sheet_name": sheet_name}
    for field in fields:
        val = data.get(field)
        record[field] = str(val).strip() if val is not None and str(val).strip() != "" else None

    cols = ["id", "sheet_name"] + fields
    placeholders = ", ".join([f":{col}" for col in cols])
    cols_str = ", ".join(cols)

    cursor.execute(f"INSERT INTO ativos ({cols_str}) VALUES ({placeholders})", record)
    conn.commit()
    cursor.execute("SELECT * FROM ativos WHERE id = ?", (ativo_id,))
    created = dict_from_row(cursor.fetchone())
    conn.close()

    enqueue_sync()
    return jsonify({"data": created}), 201

@app.route("/api/ativos/<ativo_id>", methods=["PUT"])
def update_ativo(ativo_id):
    data = request.get_json(silent=True) or {}
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM ativos WHERE id = ? AND deletado = 0", (ativo_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "Ativo não encontrado"}), 404

    fields = [
        "equipamento", "marca", "modelo", "memoria", "hd", "polegadas",
        "owner", "patrimonio", "service_tag", "hostname", "localidade",
        "andar", "sigla", "usuario", "cargo", "area", "aquisicao",
        "vencimento_garantia", "observacoes", "contrato", "inicio_contrato",
        "vencimento_contrato", "linha_atualizada_em", "baixa_em", "sheet_name"
    ]

    updates = []
    params = {}
    for field in fields:
        if field in data:
            val = data.get(field)
            updates.append(f"{field} = :{field}")
            params[field] = str(val).strip() if val is not None and str(val).strip() != "" else None

    if not updates:
        conn.close()
        return jsonify({"error": "Nenhum campo fornecido para atualização"}), 400

    updates.append("atualizado_em = datetime('now', 'localtime')")
    params["id"] = ativo_id
    set_clause = ", ".join(updates)
    cursor.execute(f"UPDATE ativos SET {set_clause} WHERE id = :id", params)
    conn.commit()
    cursor.execute("SELECT * FROM ativos WHERE id = ?", (ativo_id,))
    updated = dict_from_row(cursor.fetchone())
    conn.close()

    enqueue_sync()
    return jsonify({"data": updated})

@app.route("/api/ativos/<ativo_id>", methods=["DELETE"])
def delete_ativo(ativo_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM ativos WHERE id = ? AND deletado = 0", (ativo_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "Ativo não encontrado"}), 404
    cursor.execute("UPDATE ativos SET deletado = 1, atualizado_em = datetime('now', 'localtime') WHERE id = ?", (ativo_id,))
    conn.commit()
    conn.close()
    enqueue_sync()
    return "", 204

@app.route("/api/status", methods=["GET"])
def api_status():
    return jsonify(get_sync_status())

@app.route("/")
def index():
    return render_template("index.html")

if __name__ == "__main__":
    print(f"Servidor Inventário TI rodando em http://localhost:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=False)
