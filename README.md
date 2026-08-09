# Inventário de TI — Gestão Multi-Abas com Sincronização Excel

Aplicação web **Python + Flask + SQLite + React 18 (CDN) + Tailwind CSS (CDN)** para gestão completa do inventário de TI, com suporte nativo a **múltiplas abas da planilha original** (`Ativos`, `Sucata`, `2026-DevolverTrocarPorContrato`, `EventosExtra`), filtros avançados (Owner, Contrato, Localidade) e sincronização automática e segura com o arquivo Excel.

---

## 🏗️ Arquitetura e Decisões Técnicas

### 1. SQLite como Fonte de Verdade
- Arquivos Excel não suportam concorrência. Dois técnicos editando ao mesmo tempo → corrupção/perda de dados.
- SQLite com **WAL mode** garante transações ACID e leituras concorrentes sem bloqueio.
- O `.xlsx` atua como **espelho gerado automaticamente** em background — nunca como ponto de escrita concorrente.

### 2. Fila de Sincronização Assíncrona (`excel_sync.py`)
- Mutations (CREATE/UPDATE/DELETE) gravam no SQLite em < 10ms e enfileiram sincronização.
- Worker **single-flight** processa a fila serializada, colapsando múltiplas alterações rápidas em uma única gravação do `.xlsx`.
- Escrita **atômica** (arquivo `.tmp` → `os.replace`) evita corrupção se o processo cair no meio.
- Se o Excel estiver aberto/bloqueado, o worker retenta automaticamente sem perder dados (já salvos no SQLite).
- **Correção de condição de corrida**: Loop `while` interno elimina threads recursivas concorrentes.

### 3. Suporte Multi-Abas Nativo
- Uma única tabela `ativos` com coluna `sheet_name` separa as 4 abas da planilha original.
- Importação única carrega todas as abas preservando suas colunas originais.
- Interface com **abas de navegação** instantâneas + filtros contextuais por aba.

### 4. Filtros Avançados
- Dropdowns dinâmicos para **Owner**, **Contrato**, **Localidade** (carregados via `/api/filters?sheet=`).
- Busca livre com **debounce 300ms** em 13 colunas.
- Ordenação por qualquer coluna clicável.

### 5. UI/UX Premium (React 18 + Tailwind via CDN)
- **Dark Mode** automático (`prefers-color-scheme`) + toggle manual persistido.
- **Skeleton loaders** na tabela — sem "layout jump".
- **Toasts flutuantes** para feedback de sucesso/erro.
- **Badge de sincronização** em tempo real (verde = sincronizado, amarelo = processando, vermelho = erro).
- Modais acessíveis (ESC para fechar, foco automático, ARIA labels).

---

## 📁 Estrutura Final do Projeto

```
inventario-ti/
├── app.py                      # Servidor Flask (API REST + serve frontend)
├── config.py                   # Configuração centralizada (.env)
├── database.py                 # SQLite schema, índices, helpers
├── excel_sync.py               # Worker de sincronização (openpyxl, single-flight queue)
├── import_excel.py             # Importação multi-abas da planilha para SQLite
├── requirements.txt            # flask, flask-cors, openpyxl, python-dotenv
├── .env.example                # Modelo de configuração
├── iniciar.bat                 # Inicializador 1-clique (importa + sobe servidor + abre browser)
├── importar_planilha.bat       # Migração manual da planilha
├── README.md                   # Este arquivo
├── InventarioTI2026.xlsx       # Planilha espelho (fonte original)
├── data/
│   └── inventario.db           # Banco SQLite (criado automaticamente)
├── static/
│   └── js/app.js               # Frontend SPA (React 18, Babel, Tailwind CDN)
└── templates/
    └── index.html              # Layout HTML com CDN otimizada
```

---

## 🚀 Como Rodar no Windows

### Pré-requisitos
- **Python 3.8+** instalado (verifique com `python --version`).

### Execução (1 Clique)
1. Certifique-se que o arquivo `InventarioTI2026.xlsx` está na pasta do projeto.
2. **Duplo clique em `iniciar.bat`**.
   - Verifica/cria o banco SQLite.
   - Importa automaticamente **todas as 4 abas** da planilha (se o banco estiver vazio).
   - Sobe o servidor em **`http://localhost:3001`**.
   - Abre o navegador automaticamente.

### Comandos Manuais
```bash
# Importar/reimportar planilha (574 registros em 4 abas)
python import_excel.py

# Iniciar servidor
python app.py
# → http://localhost:3001
```

---

## 🔧 Configuração (`.env`)

O `iniciar.bat` cria o `.env` automaticamente a partir do `.env.example` na primeira execução. Edite se necessário:

```env
PORT=3001
DB_PATH=./data/inventario.db
XLSX_PATH=./InventarioTI2026.xlsx
XLSX_SHEET_NAME=Ativos
CORS_ORIGIN=*
SECRET_KEY=inventario-ti-secret-key-2026
```

---

## 📋 Abas Suportadas e Colunas

| Aba | Registros | Principais Colunas |
|-----|-----------|-------------------|
| **Ativos** | 525 | Equipamento, Marca, Modelo, Owner, Patrimônio, Service Tag, Hostname, Localidade, Usuário, Contrato, Aquisição, Venc. Garantia, etc. |
| **Sucata** | 21 | Equipamento, Patrimonio, Baixa em, Contrato, etc. |
| **2026-DevolverTrocarPorContrato** | 23 | Equipamento, Owner, Contrato, Início/Fim Contrato, etc. |
| **EventosExtra** | 5 | Mesma estrutura de Ativos |

---

## 🛠️ Stack Tecnológica

- **Backend**: Python 3.10+, Flask 3, SQLite (WAL mode), openpyxl
- **Frontend**: React 18 (via CDN), Tailwind CSS (via CDN), Babel Standalone
- **Build**: **Zero build step** — roda direto no navegador
- **Concorrência**: Threading nativo Python + SQLite WAL

---

## 📝 Licença

Uso interno — Machado Associados / TI.