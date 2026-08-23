@echo off
echo ================================
echo      NeoBooth - Khoi dong...
echo ================================
echo.
echo Dang build app...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [LOI] Build that bai! Kiem tra lai code.
    pause
    exit /b 1
)
echo.
echo Dang mo NeoBooth...
npx electron .
