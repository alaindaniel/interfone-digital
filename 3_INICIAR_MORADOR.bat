@echo off
title Interfone Digital - Morador
cd /d "%~dp0resident-app"
echo Iniciando Aplicativo do Morador...
cmd /c npm run dev
pause
