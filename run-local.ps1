# run-local.ps1 — sobe a aplicação local apontando para o Fly Postgres.
# Faz tudo: abre o proxy do banco, sobe o Spring Boot e derruba o proxy ao sair.
#
# Uso (um comando só):
#   powershell -ExecutionPolicy Bypass -File .\run-local.ps1
#
# Pré-requisitos (uma vez por máquina):
#   - fly CLI instalado e logado (fly auth login) com acesso ao projeto
#   - JDK 21 instalado
#   - .env preenchido (o script cria a partir do .env.example se faltar)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# 1. fly CLI presente?
if (-not (Get-Command fly -ErrorAction SilentlyContinue)) {
    Write-Host "ERRO: fly CLI nao encontrado. Instale: https://fly.io/docs/flyctl/install/" -ForegroundColor Red
    exit 1
}

# 2. .env existe?
if (-not (Test-Path .\.env)) {
    Copy-Item .\.env.example .\.env
    Write-Host "Criei o .env a partir do .env.example. Preencha DB_PASSWORD e rode de novo." -ForegroundColor Yellow
    Write-Host "Pegue a senha com: fly ssh console -a dataplate -C `"printenv SPRING_DATASOURCE_PASSWORD`"" -ForegroundColor Cyan
    exit 1
}

# 3. abre o proxy do banco em background
Write-Host "Abrindo proxy do banco (localhost:15432 -> dataplate-db)..." -ForegroundColor Cyan
$proxy = Start-Process fly -ArgumentList "proxy", "15432:5432", "-a", "dataplate-db" -PassThru -WindowStyle Hidden

# 4. espera a porta 15432 responder (ate ~15s)
$pronto = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $c.Connect("localhost", 15432)
        $c.Close()
        $pronto = $true
        break
    } catch { }
}
if (-not $pronto) {
    Write-Host "ERRO: o proxy nao subiu na porta 15432." -ForegroundColor Red
    Stop-Process -Id $proxy.Id -Force -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "Proxy ativo." -ForegroundColor Green

# 5. garante JAVA_HOME no JDK 21
if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
    $jdk = Get-ChildItem "C:\Program Files\Eclipse Adoptium\jdk-21*" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($jdk) { $env:JAVA_HOME = $jdk.FullName }
}

# 6. sobe a app; ao encerrar (Ctrl+C ou parada), derruba o proxy
try {
    Write-Host "Subindo a aplicacao em http://localhost:8080 ..." -ForegroundColor Cyan
    .\mvnw.cmd spring-boot:run
} finally {
    Write-Host "Encerrando proxy..." -ForegroundColor Cyan
    Stop-Process -Id $proxy.Id -Force -ErrorAction SilentlyContinue
}
