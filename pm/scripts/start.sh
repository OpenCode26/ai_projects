#!/bin/bash
set -e
cd "$(dirname "$0")/.."
docker compose up --build -d
echo "Kanban Studio running at http://localhost:8000"
