$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

Write-Host "Subindo DataPlate local: backend Python + PostgreSQL Docker..."
docker compose -f backend-python\docker-compose.yml up --build
