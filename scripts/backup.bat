@echo off
REM =============================================================================
REM Dash - Windows Backup Script
REM Creates a backup of the database for transfer to another machine
REM =============================================================================

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..
set TIMESTAMP=%date:~-4%%date:~4,2%%date:~7,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_NAME=dash_backup_%TIMESTAMP%

REM Create backup directory
if not exist "%PROJECT_DIR%\backups" mkdir "%PROJECT_DIR%\backups"
set BACKUP_DIR=%PROJECT_DIR%\backups\%BACKUP_NAME%
mkdir "%BACKUP_DIR%"

echo.
echo =========================================
echo   Dash - Windows Backup Script
echo =========================================
echo.

REM Find and copy database
echo [INFO] Looking for database...

if exist "%PROJECT_DIR%\server\prisma\dev.db" (
    echo [INFO] Found database at server\prisma\dev.db
    copy "%PROJECT_DIR%\server\prisma\dev.db" "%BACKUP_DIR%\dash.db"
    echo [OK] Database copied
) else if exist "%PROJECT_DIR%\server\dev.db" (
    echo [INFO] Found database at server\dev.db
    copy "%PROJECT_DIR%\server\dev.db" "%BACKUP_DIR%\dash.db"
    echo [OK] Database copied
) else if exist "%PROJECT_DIR%\data\dash.db" (
    echo [INFO] Found database at data\dash.db
    copy "%PROJECT_DIR%\data\dash.db" "%BACKUP_DIR%\dash.db"
    echo [OK] Database copied
) else (
    echo [WARN] No database file found
)

REM Copy .env files
echo [INFO] Backing up configuration...
mkdir "%BACKUP_DIR%\config"

if exist "%PROJECT_DIR%\server\.env" (
    copy "%PROJECT_DIR%\server\.env" "%BACKUP_DIR%\config\server.env"
)

if exist "%PROJECT_DIR%\client\.env" (
    copy "%PROJECT_DIR%\client\.env" "%BACKUP_DIR%\config\client.env"
)

echo [OK] Configuration backed up

REM Create backup info
echo { > "%BACKUP_DIR%\backup_info.json"
echo   "created_at": "%date% %time%", >> "%BACKUP_DIR%\backup_info.json"
echo   "hostname": "%COMPUTERNAME%", >> "%BACKUP_DIR%\backup_info.json"
echo   "backup_name": "%BACKUP_NAME%" >> "%BACKUP_DIR%\backup_info.json"
echo } >> "%BACKUP_DIR%\backup_info.json"

REM Create zip file if PowerShell available
echo [INFO] Creating zip archive...
powershell -command "Compress-Archive -Path '%BACKUP_DIR%' -DestinationPath '%PROJECT_DIR%\backups\%BACKUP_NAME%.zip'" 2>nul

if exist "%PROJECT_DIR%\backups\%BACKUP_NAME%.zip" (
    echo [OK] Backup archive created
    REM Clean up uncompressed folder
    rmdir /s /q "%BACKUP_DIR%"
    set BACKUP_FILE=%PROJECT_DIR%\backups\%BACKUP_NAME%.zip
) else (
    echo [WARN] Could not create zip. Backup available as folder.
    set BACKUP_FILE=%BACKUP_DIR%
)

echo.
echo =========================================
echo   Backup Complete!
echo =========================================
echo.
echo   Backup location: %PROJECT_DIR%\backups\%BACKUP_NAME%.zip
echo.
echo   To restore on Linux:
echo     1. Copy the zip file to the Linux machine
echo     2. Unzip: unzip %BACKUP_NAME%.zip
echo     3. Run: ./scripts/restore.sh %BACKUP_NAME%
echo.
echo   Or manually copy dash.db to server/prisma/dev.db
echo.

pause
