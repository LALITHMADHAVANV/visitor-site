@echo off
title Create Desktop Shortcut for Silent Thermal Printing
echo Creating "Visitor Scanner (Direct Print)" shortcut on your Desktop...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$WshShell = New-Object -ComObject WScript.Shell; $Desktop = [Environment]::GetFolderPath('Desktop'); $Shortcut = $WshShell.CreateShortcut(\"$Desktop\Visitor Scanner (Direct Print).lnk\"); $Target = 'C:\Program Files\Google\Chrome\Application\chrome.exe'; if (-not (Test-Path $Target)) { $Target = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }; if (-not (Test-Path $Target)) { $Target = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' }; $Shortcut.TargetPath = $Target; $Shortcut.Arguments = '--kiosk-printing https://visitor-site-texplus.vercel.app'; $Shortcut.Description = 'Visitor System with Instant Direct Thermal Printing'; $Shortcut.Save(); Write-Host '[SUCCESS] Shortcut created on Desktop: Visitor Scanner (Direct Print)'"

echo.
echo =====================================================================
echo  Done! Check your Windows Desktop for:
echo  "Visitor Scanner (Direct Print)"
echo.
echo  Opening the app with this shortcut will print directly to your
echo  TVS RP 3230 thermal printer WITHOUT opening the print preview dialog!
echo =====================================================================
pause
