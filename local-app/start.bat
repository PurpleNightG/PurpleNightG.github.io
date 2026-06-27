@echo off
chcp 65001 >nul
title 紫夜公会官网 - 本地版

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [错误] 未检测到 Node.js，请先安装: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "..\server\.env" (
  echo.
  echo [提示] 首次使用请先运行初始化:
  echo   cd local-app
  echo   npm run setup
  echo.
  echo 然后在 server\.env 中填写 SQLPub 数据库凭据。
  echo.
  pause
  exit /b 1
)

echo.
echo 正在启动紫夜公会官网本地版...
echo 关闭此窗口将停止所有服务。
echo.

npm run launch
if errorlevel 1 pause
