@echo off
echo ========================================
echo Hospital Management - Troubleshooter
echo ========================================
echo.

echo Select issue to fix:
echo.
echo 1. Clear node_modules and reinstall
echo 2. Check GitHub token
echo 3. Test local update
echo 4. View update logs
echo 5. Clean build cache
echo 6. Fix package.json
echo 7. Test database connection
echo 8. Exit
echo.
set /p CHOICE="Enter choice (1-8): "

if "%CHOICE%"=="1" goto REINSTALL
if "%CHOICE%"=="2" goto CHECK_TOKEN
if "%CHOICE%"=="3" goto TEST_UPDATE
if "%CHOICE%"=="4" goto VIEW_LOGS
if "%CHOICE%"=="5" goto CLEAN_CACHE
if "%CHOICE%"=="6" goto FIX_PACKAGE
if "%CHOICE%"=="7" goto TEST_DB
if "%CHOICE%"=="8" goto END

:REINSTALL
echo.
echo Removing node_modules...
rmdir /s /q node_modules 2>nul
rmdir /s /q dist 2>nul
echo.
echo Reinstalling dependencies...
call npm install
echo ✅ Done! Try building again.
goto END

:CHECK_TOKEN
echo.
echo Checking GitHub token...
echo Current GH_TOKEN: %GH_TOKEN%
echo.
if "%GH_TOKEN%"=="" (
    echo ❌ GH_TOKEN is not set!
    echo.
    echo To fix:
    echo 1. Go to: https://github.com/settings/tokens
    echo 2. Generate new token with 'repo' scope
    echo 3. Run: setx GH_TOKEN "your_token_here"
    echo 4. Restart terminal
) else (
    echo ✅ Token is set!
    echo Length: %GH_TOKEN:~0,4%...
)
goto END

:TEST_UPDATE
echo.
echo Testing update mechanism...
echo.
echo Step 1: Check current version
type package.json | findstr version
echo.
echo Step 2: Building test installer...
call npm run build:win
echo.
echo Step 3: Check dist folder
dir dist\*.exe
echo.
if exist "dist\latest.yml" (
    echo ✅ latest.yml found!
    type dist\latest.yml
) else (
    echo ❌ latest.yml not found!
)
goto END

:VIEW_LOGS
echo.
echo Opening update logs folder...
echo.
set LOG_PATH=%USERPROFILE%\AppData\Roaming\hospital-management-mysql\logs
if exist "%LOG_PATH%" (
    start "" "%LOG_PATH%"
    echo Logs folder opened!
) else (
    echo ❌ Logs folder not found!
    echo App may not have run yet.
)
goto END

:CLEAN_CACHE
echo.
echo Cleaning build cache...
rmdir /s /q dist 2>nul
rmdir /s /q node_modules\.cache 2>nul
del /f /q *.log 2>nul
echo ✅ Cache cleaned!
goto END

:FIX_PACKAGE
echo.
echo Checking package.json...
echo.
findstr /C:"electron-updater" package.json >nul
if errorlevel 1 (
    echo ❌ electron-updater not found in dependencies!
    echo Installing...
    call npm install electron-updater electron-log --save
) else (
    echo ✅ electron-updater is installed
)
echo.
findstr /C:"electron-builder" package.json >nul
if errorlevel 1 (
    echo ❌ electron-builder not found in devDependencies!
    echo Installing...
    call npm install electron-builder --save-dev
) else (
    echo ✅ electron-builder is installed
)
goto END

:TEST_DB
echo.
echo Testing MySQL connection...
echo.
echo Checking .env file...
if exist ".env" (
    echo ✅ .env file found
    type .env | findstr DB_
) else (
    echo ❌ .env file not found!
    echo Create .env file with:
    echo DB_HOST=localhost
    echo DB_PORT=3306
    echo DB_USER=root
    echo DB_PASSWORD=your_password
    echo DB_NAME=hospital_management
)
echo.
echo Starting app in dev mode to test connection...
call npm run dev
goto END

:END
echo.
echo ========================================
echo.
pause