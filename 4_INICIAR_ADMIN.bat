@echo off
title Interfone Digital - Painel Admin
cd /d "%~dp0admin-dashboard"
echo Iniciando Painel Administrativo...
cmd /c npm run dev
pause
