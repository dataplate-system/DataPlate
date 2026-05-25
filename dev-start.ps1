# Script de desenvolvimento local - DataPlate
# Uso: powershell -ExecutionPolicy Bypass -File .\dev-start.ps1

# ─── 1. Carrega .env ────────────────────────────────────────────────────────
$envFile = ".\.env"

if (-not (Test-Path $envFile)) {
    Write-Host ""
    Write-Host "ERRO: Arquivo .env nao encontrado." -ForegroundColor Red
    Write-Host "Crie o seu .env a partir do exemplo:" -ForegroundColor Yellow
    Write-Host "  copy .env.example .env" -ForegroundColor Cyan
    Write-Host "Depois preencha com as credenciais do banco de dados." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "Carregando variaveis de ambiente do .env..." -ForegroundColor Cyan

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and $line -notmatch '^#' -and $line -match '^([^=]+)=(.*)$') {
        $key   = $matches[1].Trim()
        $value = $matches[2].Trim()
        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

# ─── 2. Localiza o JDK 21 ────────────────────────────────────────────────────
function Find-Jdk21 {
    # Prioridade 1: JAVA_HOME ja definido e valido para Java 21
    if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
        $version = (& "$env:JAVA_HOME\bin\java.exe" -version 2>&1) | Select-Object -First 1
        if ($version -match '"21') {
            return $env:JAVA_HOME
        }
    }

    # Prioridade 2: java.exe ja esta no PATH
    $javaCmd = Get-Command java -ErrorAction SilentlyContinue
    if ($javaCmd) {
        $version = (& $javaCmd.Source -version 2>&1) | Select-Object -First 1
        if ($version -match '"21') {
            return (Split-Path (Split-Path $javaCmd.Source))
        }
    }

    # Prioridade 3: Registro do Windows (metodo mais confiavel)
    $registryPaths = @(
        "HKLM:\SOFTWARE\JavaSoft\JDK",
        "HKLM:\SOFTWARE\JavaSoft\Java Development Kit",
        "HKLM:\SOFTWARE\WOW6432Node\JavaSoft\JDK"
    )
    foreach ($regPath in $registryPaths) {
        if (Test-Path $regPath) {
            Get-ChildItem $regPath -ErrorAction SilentlyContinue | ForEach-Object {
                if ($_.PSChildName -like "21*") {
                    $javaHome = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).JavaHome
                    if ($javaHome -and (Test-Path "$javaHome\bin\java.exe")) {
                        return $javaHome
                    }
                }
            }
        }
    }

    # Prioridade 4: Pastas de instalacao conhecidas
    $candidatos = @(
        "$env:ProgramFiles\Eclipse Adoptium",
        "$env:ProgramFiles\Java",
        "$env:ProgramFiles\Microsoft",
        "$env:ProgramFiles\Amazon Corretto",
        "$env:ProgramFiles\Zulu",
        "$env:ProgramFiles\BellSoft\LibericaJDK-21*",
        "$env:LOCALAPPDATA\Programs\Eclipse Adoptium"
    )
    foreach ($base in $candidatos) {
        Get-ChildItem $base -ErrorAction SilentlyContinue | Where-Object {
            $_.Name -like "*21*" -and (Test-Path "$($_.FullName)\bin\java.exe")
        } | ForEach-Object {
            return $_.FullName
        }
    }

    return $null
}

$jdkPath = Find-Jdk21

if ($jdkPath) {
    $env:JAVA_HOME = $jdkPath
    $env:PATH      = "$jdkPath\bin;$env:PATH"
} else {
    Write-Host ""
    Write-Host "ERRO: JDK 21 nao encontrado." -ForegroundColor Red
    Write-Host "Instale o JDK 21 (recomendado: Eclipse Temurin 21):" -ForegroundColor Yellow
    Write-Host "  https://adoptium.net/temurin/releases/?version=21" -ForegroundColor Cyan
    Write-Host "Apos instalar, feche e abra o terminal novamente." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# ─── 3. Valida versao do Java ─────────────────────────────────────────────────
$javaVersion = (java -version 2>&1) | Select-Object -First 1
Write-Host "Java : $javaVersion" -ForegroundColor Gray
Write-Host "Banco: $env:DB_HOST/$env:DB_NAME" -ForegroundColor Gray
Write-Host ""

# ─── 4. Libera a porta 8080 se estiver ocupada ───────────────────────────────
$porta = 8080
$processoNaPorta = Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue
if ($processoNaPorta) {
    $pid8080 = $processoNaPorta.OwningProcess | Select-Object -First 1
    $proc    = Get-Process -Id $pid8080 -ErrorAction SilentlyContinue
    Write-Host "AVISO: Porta $porta ocupada pelo processo '$($proc.ProcessName)' (PID $pid8080). Encerrando..." -ForegroundColor Yellow
    Stop-Process -Id $pid8080 -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
}

# ─── 5. Inicia o Spring Boot ──────────────────────────────────────────────────
Write-Host "Iniciando Spring Boot em http://localhost:8080 ..." -ForegroundColor Green
Write-Host "Pressione Ctrl+C para parar." -ForegroundColor Gray
Write-Host ""

.\mvnw.cmd spring-boot:run
