@echo off
title Interfone Morador - Gerador Automatico de APK
cd /d "%~dp0"

echo ========================================================
echo   GERADOR AUTOMATICO DE APK - INTERFONE MORADOR
echo ========================================================
echo.

set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot"
set "ANDROID_HOME=C:\Users\amwin\AppData\Local\Android\Sdk"
set "GRADLE_HOME=C:\Users\amwin\.gradle\gradle-8.14.3\gradle-8.14.3"
set "PATH=%GRADLE_HOME%\bin;%JAVA_HOME%\bin;%ANDROID_HOME%\cmdline-tools\latest\bin;%ANDROID_HOME%\platform-tools;%PATH%"

echo [1/3] Compilando aplicacao React...
cd resident-app
call npm.cmd run build

echo.
echo [2/3] Sincronizando com o Capacitor...
call npx.cmd cap sync android

echo.
echo [3/3] Gerando arquivo APK com Gradle...
cd android
call gradle.bat assembleDebug --no-daemon

if exist "app\build\outputs\apk\debug\app-debug.apk" (
    echo.
    echo ========================================================
    echo   [SUCESSO] APK GERADO COM SUCESSO!
    echo ========================================================
    copy "app\build\outputs\apk\debug\app-debug.apk" "..\..\interfone-morador.apk" /y
    echo O arquivo APK foi copiado para:
    echo D:\Projetos_Docker\QR-Intercom\interfone-morador.apk
    echo.
) else (
    echo.
    echo ========================================================
    echo   Verifique o log acima para detalhes do build.
    echo ========================================================
)

pause
