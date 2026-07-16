@echo off
cd /d "%~dp0\.."
docker compose up --build -d
echo Kanban Studio running at http://localhost:8000
