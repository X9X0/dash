@echo off
REM =============================================================================
REM Dash - Windows Backup Script
REM Creates a backup of the database, uploaded files and .env configuration
REM for transfer to another machine (restore with ./scripts/restore.sh on Linux)
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

REM Find the database
echo [INFO] Looking for database...

set DB_PATH=
if exist "%PROJECT_DIR%\server\prisma\dev.db" set DB_PATH=%PROJECT_DIR%\server\prisma\dev.db
if not defined DB_PATH if exist "%PROJECT_DIR%\server\dev.db" set DB_PATH=%PROJECT_DIR%\server\dev.db
if not defined DB_PATH if exist "%PROJECT_DIR%\data\dash.db" set DB_PATH=%PROJECT_DIR%\data\dash.db

REM Copying a live SQLite file can give an inconsistent snapshot (a write in
REM progress, or committed data still in the -wal/-journal sidecar). If
REM sqlite3.exe is on PATH use its online backup API (always consistent);
REM otherwise copy the file plus any sidecars and warn. Stop the server first
REM for a guaranteed-clean plain copy.
if defined DB_PATH (
    echo [INFO] Found database at %DB_PATH%
    where sqlite3 >nul 2>&1
    if !errorlevel! equ 0 (
        sqlite3 "%DB_PATH%" ".backup '%BACKUP_DIR%\dash.db'"
        echo [OK] Database backed up with sqlite3
    ) else (
        echo [WARN] sqlite3.exe not found on PATH; copying the database file directly.
        echo [WARN] If the Dash server is running, this copy may be inconsistent.
        copy "%DB_PATH%" "%BACKUP_DIR%\dash.db" >nul
        if exist "%DB_PATH%-wal" copy "%DB_PATH%-wal" "%BACKUP_DIR%\dash.db-wal" >nul
        if exist "%DB_PATH%-journal" copy "%DB_PATH%-journal" "%BACKUP_DIR%\dash.db-journal" >nul
        echo [OK] Database copied
    )
) else (
    echo [WARN] No database file found
)

REM Copy uploaded files: data\uploads (current location) plus server\uploads
REM (legacy location used by older installs), merged into one uploads folder.
echo [INFO] Backing up uploads...
mkdir "%BACKUP_DIR%\uploads"
set UPLOADS_FOUND=0
if exist "%PROJECT_DIR%\data\uploads\" (
    xcopy "%PROJECT_DIR%\data\uploads" "%BACKUP_DIR%\uploads" /E /I /Q /Y >nul
    set UPLOADS_FOUND=1
)
if exist "%PROJECT_DIR%\server\uploads\" (
    xcopy "%PROJECT_DIR%\server\uploads" "%BACKUP_DIR%\uploads" /E /I /Q /Y >nul
    set UPLOADS_FOUND=1
)
if "!UPLOADS_FOUND!"=="1" (
    echo [OK] Uploads backed up
) else (
    echo [INFO] No uploads to backup
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
echo   Note: the archive contains server.env (secrets) - store it securely.
echo.
echo   To restore on Linux (restore.sh accepts the .zip directly):
echo     1. Copy the zip file to the Linux machine
echo     2. Run: ./scripts/restore.sh %BACKUP_NAME%.zip
echo.
echo   Or manually: the zip contains %BACKUP_NAME%\dash.db - copy it to data\dash.db
echo   (production) or server\prisma\dev.db (development) and its uploads\ folder
echo   to data\uploads\ while the server is stopped.
echo.

pause
