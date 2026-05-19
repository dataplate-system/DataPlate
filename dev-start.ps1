# Script de desenvolvimento local - DataPlate
# Uso: ./dev-start.ps1

$envFile = ".\.env"

if (-not (Test-Path $envFile)) {
    Write-Host "ERRO: Arquivo .env nao encontrado." -ForegroundColor Red
    Write-Host "Copie o .env.example para .env e preencha com suas credenciais:" -ForegroundColor Yellow
    Write-Host "  copy .env.example .env" -ForegroundColor Cyan
    exit 1
}

Write-Host "Carregando variaveis de ambiente do .env..." -ForegroundColor Cyan

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and $line -notmatch '^#' -and $line -match '^([^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

Write-Host "Iniciando Spring Boot em http://localhost:8080 ..." -ForegroundColor Green
Write-Host "Banco: $env:DB_HOST/$env:DB_NAME" -ForegroundColor Gray
Write-Host "Java: $(& java -version 2>&1 | Select-Object -First 1)" -ForegroundColor Gray
Write-Host ""

.\mvnw.cmd spring-boot:run
