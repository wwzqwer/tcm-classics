@echo off
chcp 65001 >nul
title 杏林溯源 网站服务器（端口 8734）
echo ============================================
echo  杏林溯源 · 中医经典网站
echo  本机访问:  http://127.0.0.1:8734/v2.html
echo  局域网访问: http://<本机IP>:8734/v2.html  （用 ipconfig 查本机 IPv4）
echo  关闭本窗口即停止网站服务
echo ============================================
set PY="C:\Users\asus\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
if not exist %PY% set PY=python
%PY% "C:\Users\asus\Documents\deepseek-harness\default-workspace\tcm-classics\tools\serve_nocache.py" 8734
pause
