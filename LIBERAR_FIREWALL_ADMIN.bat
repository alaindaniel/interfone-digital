@echo off
title Liberar Portas do Interfone no Firewall
:: BatchGotAdmin
:-------------------------------------
REM --> Check for permissions
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"

REM --> If error flag set, we do not have admin.
if '%errorlevel%' NEQ '0' (
    echo Solicitando privilegios de Administrador...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    set params = %*:"=""
    echo UAC.ShellExecute "cmd.exe", "/c %~s0 %params%", "", "runas", 1 >> "%temp%\getadmin.vbs"

    "%temp%\getadmin.vbs"
    del "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
    pushd "%CD%"
    CD /D "%~dp0"
:--------------------------------------

echo ========================================================
echo   LIBERANDO PORTAS NO FIREWALL DO WINDOWS
echo   (TCP 4000, 3000, 3001, 3002, 3030 e UDP WebRTC)
echo ========================================================
echo.

netsh advfirewall firewall delete rule name="Interfone Digital Ports" >nul 2>&1
netsh advfirewall firewall delete rule name="Interfone Digital Ports TCP" >nul 2>&1
netsh advfirewall firewall delete rule name="Interfone Digital WebRTC UDP" >nul 2>&1

netsh advfirewall firewall add rule name="Interfone Digital Ports TCP" dir=in action=allow protocol=TCP localport=4000,3000,3001,3002,3030
netsh advfirewall firewall add rule name="Interfone Digital WebRTC UDP" dir=in action=allow protocol=UDP localport=4000,10000-65535

echo.
echo ========================================================
echo   [OK] Portas TCP e UDP liberadas com sucesso!
echo   Agora qualquer celular conseguira conectar pelo Wi-Fi.
echo ========================================================
pause
