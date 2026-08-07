$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host ""
  Write-Host "[错误] 未检测到 Node.js，请先安装: https://nodejs.org/" -ForegroundColor Red
  Write-Host ""
  Read-Host "按 Enter 退出"
  exit 1
}

if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env" -Force
  Write-Host ""
  Write-Host "[提示] 已从 .env.example 创建 .env，请按需修改 REMOTE_API_URL" -ForegroundColor Yellow
  Write-Host ""
}

Write-Host ""
Write-Host "正在启动本地前端（API 指向 Linux）..."
Write-Host "关闭此窗口将停止本机页面服务。"
Write-Host ""

npm run launch
if ($LASTEXITCODE -ne 0) {
  Read-Host "按 Enter 退出"
}
