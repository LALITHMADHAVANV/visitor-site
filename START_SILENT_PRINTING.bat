@echo off
title Visitor System - Direct Silent Printing
echo ======================================================================
echo   VISITOR PASS SYSTEM - DIRECT THERMAL PRINTING
echo   (Prints instantly without opening the browser Print Preview page)
echo ======================================================================
echo.

set APP_URL=https://visitor-site-texplus.vercel.app

:: Check common Chrome paths
set CHROME_PATH=""
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH="%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
)

:: Check common Edge paths
set EDGE_PATH=""
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set EDGE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
) else if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    set EDGE_PATH="C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

if not %CHROME_PATH%=="" (
    echo [OK] Launching Google Chrome in Silent Kiosk Printing mode...
    echo      Target Printer: Windows Default Printer (TVS RP 3230)
    echo      URL: %APP_URL%
    echo.
    start "" %CHROME_PATH% --kiosk-printing "%APP_URL%"
) else if not %EDGE_PATH%=="" (
    echo [OK] Launching Microsoft Edge in Silent Kiosk Printing mode...
    echo      Target Printer: Windows Default Printer (TVS RP 3230)
    echo      URL: %APP_URL%
    echo.
    start "" %EDGE_PATH% --kiosk-printing "%APP_URL%"
) else (
    echo [!] Could not locate Chrome or Edge automatically.
    echo Please add --kiosk-printing to your browser shortcut.
    pause
    exit /b
)

echo Direct printing is active! When security scans a QR code, 
echo the badge will print directly without opening any print window.
echo.
timeout /t 5
