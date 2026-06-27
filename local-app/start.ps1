$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host ""
  Write-Host "[错误] 未检测到 Node.js，请先安装: https://nodejs.org/" -ForegroundColor Red
  Write-Host ""
  Read-Host "按 Enter 退出"
  exit 1
}

if (-not (Test-Path "..\server\.env")) {
  Write-Host ""
  Write-Host "[提示] 首次使用请先运行初始化:" -ForegroundColor Yellow
  Write-Host "  cd local-app"
  Write-Host "  npm run setup"
  Write-Host ""
  Write-Host "然后在 server\.env 中填写 SQLPub 数据库凭据。"
  Write-Host ""
  Read-Host "按 Enter 退出"
  exit 1
}

Write-Host ""
Write-Host "正在启动紫夜公会官网本地版..."
Write-Host "关闭此窗口将停止所有服务。"
Write-Host ""

npm run launch
if ($LASTEXITCODE -ne 0) {
  Read-Host "按 Enter 退出"
}
