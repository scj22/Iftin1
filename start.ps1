# Starts the AI service, backend and frontend in separate PowerShell windows.
$root = $PSScriptRoot

$python = Join-Path $root 'ai-service\.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    Write-Host 'Python virtualenv not found.' -ForegroundColor Red
    Write-Host 'Run: cd ai-service; python -m venv .venv; .venv\Scripts\python -m pip install -r requirements.txt'
    exit 1
}

Write-Host 'Starting AI service on :8000 (first start takes ~15s to score the network)...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\ai-service'; & '$python' -m uvicorn app.main:app --port 8000"

Write-Host 'Starting backend on :4000...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\backend'; npm run dev"

Write-Host 'Starting frontend on :5173...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\frontend'; npm run dev"

Write-Host ''
Write-Host 'Smart Road is starting. Open http://localhost:5173 once the frontend is ready.' -ForegroundColor Green
Write-Host 'Close the three PowerShell windows to stop the services.'
