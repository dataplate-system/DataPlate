$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$frontendJob = $null
$frontendPort = 5500
$frontendPath = Join-Path $PSScriptRoot "frontend"

try {
    $frontendPortInUse = Get-NetTCPConnection -LocalPort $frontendPort -ErrorAction SilentlyContinue

    if ($frontendPortInUse) {
        Write-Host "Frontend ja esta rodando em http://localhost:$frontendPort/pages/adm-login.html"
    }
    else {
        Write-Host "Subindo frontend em http://localhost:$frontendPort/pages/adm-login.html..."
        $frontendJob = Start-Job -ScriptBlock {
            param($path, $port)

            Set-Location $path
            python -m http.server $port
        } -ArgumentList $frontendPath, $frontendPort
    }

    Write-Host "Subindo DataPlate local: backend Python + PostgreSQL Docker..."
    docker compose -f backend-python\docker-compose.yml up --build
}
finally {
    if ($frontendJob) {
        Write-Host "Encerrando servidor local do frontend..."
        Stop-Job $frontendJob -ErrorAction SilentlyContinue
        Remove-Job $frontendJob -Force -ErrorAction SilentlyContinue
    }
}
