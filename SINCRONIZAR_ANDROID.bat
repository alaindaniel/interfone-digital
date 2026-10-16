@echo off
title Interfone Morador - Sincronizar Projeto Android
cd /d "%~dp0resident-app"
echo Compilando aplicacao React...
cmd /c npm.cmd run build
echo Sincronizando com o projeto Android nativo...
cmd /c npx.cmd cap sync android
echo.
echo ========================================================
echo [OK] Projeto Android sincronizado com sucesso!
echo.
echo Para gerar o arquivo APK:
echo 1. Execute ABRIR_ANDROID_STUDIO.bat
echo 2. No Android Studio, clique em: Build > Build Bundle(s) / APK(s) > Build APK(s)
echo ========================================================
pause
