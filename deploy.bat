@echo off
echo ========================================
echo   紫夜公会网站 - GitHub Pages 部署脚本
echo ========================================
echo.

echo [1/5] 添加所有文件到 Git...
git add .

echo.
echo [2/5] 提交更改...
git commit -m "部署到 GitHub Pages - 配置完成"

echo.
echo [3/5] 推送到 GitHub...
git push -u origin main

echo.
echo ========================================
echo   部署完成！
echo ========================================
echo.
echo 接下来的步骤：
echo.
echo 1. 访问你的 GitHub 仓库：
echo    https://github.com/PurpleNightG/PurpleNightG.github.io
echo.
echo 2. 点击 Settings ^> Pages
echo.
echo 3. 在 "Source" 下选择 "GitHub Actions"
echo.
echo 4. 等待几分钟，GitHub Actions 会自动构建和部署
echo.
echo 5. 访问你的网站：
echo    https://purplenightg.github.io
echo.
echo 提示：你可以在 Actions 标签页查看部署进度
echo.
pause
