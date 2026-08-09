import os
import sqlite3
from typing import List, Dict, Any, Optional
from config import DB_PATH

def get_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

# Abas padrão que existem na planilha original — usadas apenas na primeira
# inicialização do banco. Depois disso, o usuário pode criar/editar/remover
# abas livremente pela interface, e o banco passa a ser fonte de verdade.
DEFAULT_SHEETS = [
    {"name": "Ativos", "display_name": "Ativos", "position": 0},
    {"name": "Sucata", "display_name": "Sucata", "position": 1},
    {"name": "2026-DevolverTrocarPorContrato", "display_name": "Devolver/Trocar", "position": 2},
    {"name": "EventosExtra", "display_name": "Eventos Extra", "position": 3},
]

def init_db() -> None:
    conn = get_connection()
    cursor = conn.cursor()

    # Tabela de abas (sheets) — gerencia as abas dinamicamente.
    # 'name' é o nome real da aba no Excel; 'display_name' é o rótulo na UI.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sheets (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL UNIQUE,
        display_name  TEXT NOT NULL,
        position      INTEGER NOT NULL DEFAULT 0,
        criado_em     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    """)

    # Tabela principal de ativos — uma coluna 'sheet_name' vincula cada
    # registro à sua aba. O nome da aba aqui referencia sheets.name.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ativos (
        id                    TEXT PRIMARY KEY,
        sheet_name            TEXT NOT NULL DEFAULT 'Ativos',
        equipamento           TEXT,
        marca                 TEXT,
        modelo                TEXT,
        memoria               TEXT,
        hd                    TEXT,
        polegadas             TEXT,
        owner                 TEXT,
        patrimonio            TEXT,
        service_tag           TEXT,
        hostname              TEXT,
        localidade            TEXT,
        andar                 TEXT,
        sigla                 TEXT,
        usuario               TEXT,
        cargo                 TEXT,
        area                  TEXT,
        aquisicao             TEXT,
        vencimento_garantia   TEXT,
        observacoes           TEXT,
        contrato              TEXT,
        inicio_contrato       TEXT,
        vencimento_contrato   TEXT,
        linha_atualizada_em   TEXT,
        baixa_em              TEXT,
        criado_em             TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        atualizado_em         TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        deletado              INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (sheet_name) REFERENCES sheets(name) ON DELETE CASCADE
    );
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ativos_sheet ON ativos(sheet_name);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ativos_patrimonio ON ativos(patrimonio);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ativos_hostname ON ativos(hostname);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ativos_usuario ON ativos(usuario);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ativos_owner ON ativos(owner);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ativos_contrato ON ativos(contrato);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ativos_localidade ON ativos(localidade);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ativos_deletado ON ativos(deletado);")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sync_queue (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        criado_em     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        processado    INTEGER NOT NULL DEFAULT 0,
        erro          TEXT
    );
    """)

    # Popula abas padrão se a tabela estiver vazia (primeira inicialização)
    cursor.execute("SELECT COUNT(*) as n FROM sheets")
    if cursor.fetchone()["n"] == 0:
        for s in DEFAULT_SHEETS:
            cursor.execute(
                "INSERT INTO sheets (name, display_name, position) VALUES (?, ?, ?)",
                (s["name"], s["display_name"], s["position"])
            )

    conn.commit()
    conn.close()

def dict_from_row(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}

def dict_from_rows(rows: List[sqlite3.Row]) -> List[Dict[str, Any]]:
    return [dict_from_row(row) for row in rows]

def get_all_sheet_names() -> List[str]:
    """Retorna os nomes reais de todas as abas cadastradas no banco."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sheets ORDER BY position")
    rows = cursor.fetchall()
    conn.close()
    return [row["name"] for row in rows]

def get_sheet_configs() -> Dict[str, Dict[str, Any]]:
    """
    Retorna a configuração de colunas para cada aba.
    Abas criadas dinamicamente pelo usuário usam o schema completo (todas as colunas),
   com header padrão. Abas originais mantêm seus headers específicos.
    """
    sheet_names = get_all_sheet_names()

    # Colunas completas — usadas para qualquer aba nova criada pelo usuário
    full_columns = [
        ("EQUIPAMENTO", "equipamento"),
        ("MARCA", "marca"),
        ("MODELO", "modelo"),
        ("MEMÓRIA", "memoria"),
        ("HD", "hd"),
        ("POLEGADAS", "polegadas"),
        ("OWNER", "owner"),
        ("PATRIMONIO", "patrimonio"),
        ("SERVICE TAG", "service_tag"),
        ("HOSTNAME", "hostname"),
        ("LOCALIDADE", "localidade"),
        ("ANDAR", "andar"),
        ("SIGLA", "sigla"),
        ("USUÁRIO", "usuario"),
        ("CARGO", "cargo"),
        ("ÁREA", "area"),
        ("AQUISIÇÃO", "aquisicao"),
        ("VENCIMENTO DE GARANTIA", "vencimento_garantia"),
        ("OBSERVAÇÕES", "observacoes"),
        ("CONTRATO", "contrato"),
        ("INÍCIO DO CONTRATO", "inicio_contrato"),
        ("VENCIMENTO DO CONTRATO", "vencimento_contrato"),
        ("LINHA ATUALIZADA EM", "linha_atualizada_em"),
        ("BAIXA EM", "baixa_em"),
    ]
    full_date_keys = {"aquisicao", "vencimento_garantia", "inicio_contrato", "vencimento_contrato", "baixa_em"}

    configs = {}
    for name in sheet_names:
        configs[name] = {"columns": full_columns, "date_keys": full_date_keys}
    return configs
