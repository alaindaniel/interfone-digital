@echo off
title Interfone Morador - Abrir Android Studio
cd /d "%~dp0resident-app"
echo Abrindo o projeto Android no Android Studio...
cmd /c npx.cmd cap open android
pause
