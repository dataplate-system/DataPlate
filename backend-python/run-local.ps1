$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$PythonExe = "python"
$PythonArgs = @()

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        $PythonExe = "py"
        $PythonArgs = @("-3.12")
    } else {
        Write-Error "Python nao encontrado. Para evitar problemas entre PCs, use: docker compose up --build"
    }
}

if (-not (Test-Path ".venv")) {
    & $PythonExe @PythonArgs -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Nao foi possivel criar o ambiente virtual Python. Caminho recomendado: docker compose up --build"
    }
}

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
    Write-Error "Ambiente virtual incompleto. Apague backend-python\.venv e rode novamente, ou use: docker compose up --build"
}

.\.venv\Scripts\python.exe -m pip --version
if ($LASTEXITCODE -ne 0) {
    Write-Error "O Python local nao tem pip no ambiente virtual. Caminho recomendado: docker compose up --build"
}

.\.venv\Scripts\python.exe -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    Write-Error "Falha ao atualizar pip."
}

.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Error "Falha ao instalar dependencias Python."
}

.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8081 --reload
