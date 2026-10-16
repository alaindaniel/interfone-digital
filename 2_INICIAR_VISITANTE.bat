@echo off
title Interfone Digital - Visitante
cd /d "%~dp0web-visitor"
echo Iniciando Interface do Visitante...
cmd /c npm run dev
pause
