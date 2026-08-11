@echo off
setlocal enabledelayedexpansion
title Inventario TI - Importar Planilha
color 0B
cd /d "%~dp0"

echo ============================================
echo   Inventario TI - Importacao de Planilha
echo ============================================
echo.

python import_excel.py

echo.
echo Importacao finalizada!
pause
