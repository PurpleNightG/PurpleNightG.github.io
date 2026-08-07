@echo off
chcp 65001 >nul
title 紫夜公会官网 - 本地版（远程 API）

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [错误] 未检测到 Node.js，请先安装: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo.
    echo [提示] 已从 .env.example 创建 .env，请按需修改 REMOTE_API_URL
    echo.
  )
)

echo.
echo 正在启动本地前端（API 指向 Linux）...
echo 关闭此窗口将停止本机页面服务。
echo.

npm run launch
if errorlevel 1 pause
