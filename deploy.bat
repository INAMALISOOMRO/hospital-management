@echo off
echo ========================================
echo Hospital Management - Auto Deployment
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    echo.
)

REM Get current version
for /f "tokens=2 delims=:, " %%a in ('findstr /C:"\"version\"" package.json') do set CURRENT_VERSION=%%a
set CURRENT_VERSION=%CURRENT_VERSION:"=%

echo Current Version: %CURRENT_VERSION%
echo.

REM Ask for version bump type
echo Select version update type:
echo 1. Patch (Bug fixes: 1.0.0 -^> 1.0.1)
echo 2. Minor (New features: 1.0.0 -^> 1.1.0)
echo 3. Major (Breaking changes: 1.0.0 -^> 2.0.0)
echo 4. No version change (rebuild current)
echo.
set /p VERSION_TYPE="Enter choice (1-4): "

if "%VERSION_TYPE%"=="1" (
    echo Bumping patch version...
    call npm version patch
) else if "%VERSION_TYPE%"=="2" (
    echo Bumping minor version...
    call npm version minor
) else if "%VERSION_TYPE%"=="3" (
    echo Bumping major version...
    call npm version major
) else if "%VERSION_TYPE%"=="4" (
    echo Keeping current version...
) else (
    echo Invalid choice! Exiting...
    pause
    exit /b
)

echo.
echo ========================================
echo Building Application...
echo ========================================
call npm run build:win

if errorlevel 1 (
    echo.
    echo ❌ Build failed!
    echo Check the errors above and try again.
    pause
    exit /b
)

echo.
echo ========================================
echo Build Successful! ✅
echo ========================================
echo.
echo Installer created in: dist\
echo.

REM Ask if user wants to publish to GitHub
set /p PUBLISH="Do you want to publish to GitHub? (Y/N): "

if /i "%PUBLISH%"=="Y" (
    echo.
    echo ========================================
    echo Publishing to GitHub...
    echo ========================================
    
    REM Commit changes if any
    git add .
    set /p COMMIT_MSG="Enter commit message (or press Enter for default): "
    if "%COMMIT_MSG%"=="" set COMMIT_MSG=Release new version
    
    git commit -m "%COMMIT_MSG%"
    git push
    
    REM Publish to GitHub Releases
    call npm run publish
    
    echo.
    echo ========================================
    echo Published Successfully! 🚀
    echo ========================================
    echo.
    echo Users will receive the update automatically!
) else (
    echo.
    echo ========================================
    echo Local Build Complete
    echo ========================================
    echo.
    echo You can manually upload the installer from dist\ folder
)

echo.
echo Files created:
echo - dist\Hospital-Management-Setup-%CURRENT_VERSION%.exe
echo - dist\latest.yml
echo.
pause