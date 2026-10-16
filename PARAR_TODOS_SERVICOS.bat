@echo off
title Interfone Digital - Parar Servicos
echo Encerrando processos nas portas 4000, 3000, 3001, 3002...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4000 "') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 "') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3002 "') do taskkill /f /pid %%a 2>nul
echo.
echo Todos os servicos foram liberados com sucesso!
pause
