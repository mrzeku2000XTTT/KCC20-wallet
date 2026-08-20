@echo off
cd /d "%~dp0"
echo.
echo  KCC20 Wallet
echo  Open: http://127.0.0.1:4173
echo.
npx --yes serve -p 4173
