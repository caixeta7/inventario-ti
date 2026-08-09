@echo off
setlocal enabledelayedexpansion
title Inventario TI - Servidor
color 0A
cd /d "%~dp0"

echo ============================================
echo   Inventario TI - Servidor Local
echo ============================================
echo.

REM Verifica se o .env existe
if not exist ".env" (
    echo [INFO] Arquivo .env nao encontrado. Copiando de .env.example...
    copy ".env.example" ".env" >nul
)

REM Verifica se o banco existe, se nao tenta importar
if not exist "data\inventario.db" (
    echo [INFO] Banco de dados nao encontrado. Verificando planilha...
    if exist "InventarioTI2026.xlsx" (
        echo [INFO] Planilha encontrada. Importando dados iniciais...
        python import_excel.py
    ) else (
        echo [AVISO] Planilha InventarioTI2026.xlsx nao encontrada na raiz.
        echo         Coloque o arquivo na pasta do projeto e rode importar_planilha.bat depois.
    )
)

echo.
echo [OK] Iniciando servidor em http://localhost:3001
echo.
echo   Para encerrar: aperte Ctrl+C ou feche esta janela.
echo.

REM Abre o navegador com pequeno atraso
start "" cmd /c "timeout /t 2 >nul && start http://localhost:3001"

REM Inicia o Flask
python app.py