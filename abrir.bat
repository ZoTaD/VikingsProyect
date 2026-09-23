@echo off
rem Abre La despensa en http://localhost:5190
cd /d "%~dp0"
start "" http://localhost:5190
python serve.py 5190
