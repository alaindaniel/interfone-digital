@echo off
title Interfone Digital - Auto Deploy & Teste no Celular
echo ========================================================
echo   INTERFONE DIGITAL - AUTO DEPLOY & TESTE NO CELULAR
echo ========================================================
echo.

set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
set ANDROID_HOME=C:\Users\amwin\AppData\Local\Android\Sdk
set GRADLE_HOME=C:\Users\amwin\.gradle\gradle-8.14.3\gradle-8.14.3
set SCRCPY_DIR=C:\Users\amwin\AppData\Local\Microsoft\WinGet\Packages\Genymobile.scrcpy_Microsoft.Winget.Source_8wekyb3d8bbwe\scrcpy-win64-v4.0
set PATH=%SCRCPY_DIR%;%GRADLE_HOME%\bin;%JAVA_HOME%\bin;%ANDROID_HOME%\cmdline-tools\latest\bin;%ANDROID_HOME%\platform-tools;%PATH%

echo [1/4] Verificando celular conectado...
adb.exe devices
echo.

echo [2/4] Compilando Web e Android...
cd /d "D:\Projetos_Docker\QR-Intercom\resident-app"
call npm.cmd run build
call npx.cmd cap sync android

cd /d "D:\Projetos_Docker\QR-Intercom\resident-app\android"
call gradle.bat assembleDebug --no-daemon

copy /y "app\build\outputs\apk\debug\app-debug.apk" "D:\Projetos_Docker\QR-Intercom\interfone-morador.apk"

echo.
echo [3/4] Instalando direto no celular conectado via ADB...
adb.exe install -r "D:\Projetos_Docker\QR-Intercom\interfone-morador.apk"

echo.
echo [4/4] Abrindo o aplicativo no celular e iniciando tela no PC...
adb.exe shell am start -n br.com.interfone.morador/.MainActivity

echo Abrindo espelhamento Scrcpy...
start "" "%SCRCPY_DIR%\scrcpy.exe" --always-on-top --window-title "Interfone Morador (Celular)"

echo.
echo ========================================================
echo   [SUCESSO] Aplicativo instalado e aberto na sua tela!
echo ========================================================
pause
