import os
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Carrega variáveis do .env se existir
load_dotenv(os.path.join(BASE_DIR, ".env"))

PORT = int(os.environ.get("PORT", 3001))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "data", "inventario.db"))
# Caminho da planilha espelho Excel
XLSX_PATH = os.environ.get("XLSX_PATH", os.path.join(BASE_DIR, "InventarioTI2026.xlsx"))
XLSX_SHEET_NAME = os.environ.get("XLSX_SHEET_NAME", "Ativos")
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")
SECRET_KEY = os.environ.get("SECRET_KEY", "inventario-ti-secret-key-2026")
