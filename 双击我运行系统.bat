@echo off
chcp 65001 > nul
title Ciallo AI 智能刷题系统 (极客极光暗黑版)

echo ======================================================
echo  🚀 正在启动 Ciallo AI 智能刷题系统...
echo  🌐 本地服务端口: 8080
echo  📂 数据库与配置将保存在当前目录下
echo ======================================================
echo.

:: 启动 exe 服务（在当前窗口运行以展示后台日志）
:: 自动在默认浏览器中打开页面
start http://localhost:8080
exam_system.exe

pause
