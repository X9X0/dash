# Dash - Windows Backup Script (PowerShell)
# Backs up the SQLite database, uploaded files and .env configuration into
# backups\dash_backup_<timestamp>.zip. The archive can be restored on Linux with
# ./scripts/restore.sh <file>.zip (it accepts the zip directly).

# Project root = parent of the scripts\ folder this file lives in.
$SCRIPT_DIR = $PSScriptRoot
if (-not $SCRIPT_DIR) { $SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $SCRIPT_DIR) {
    Write-Host "[ERROR] Cannot determine the script location. Run this file from disk (e.g. .\scripts\backup.ps1)."
    exit 1
}
$PROJECT_DIR = Split-Path -Parent $SCRIPT_DIR

$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"
$BACKUP_NAME = "dash_backup_$TIMESTAMP"
$BACKUP_DIR = Join-Path $PROJECT_DIR "backups\$BACKUP_NAME"

Write-Host ""
Write-Host "========================================="
Write-Host "  Dash - Backup Script"
Write-Host "========================================="
Write-Host ""

# Create backup directory
New-Item -ItemType Directory -Force -Path $BACKUP_DIR | Out-Null
New-Item -ItemType Directory -Force -Path "$BACKUP_DIR\config" | Out-Null
New-Item -ItemType Directory -Force -Path "$BACKUP_DIR\uploads" | Out-Null

Write-Host "[INFO] Creating backup: $BACKUP_NAME"

# Find and copy database
$DB_FOUND = $false
$DB_PATHS = @(
    "$PROJECT_DIR\server\prisma\dev.db",
    "$PROJECT_DIR\server\dev.db",
    "$PROJECT_DIR\data\dash.db"
)

foreach ($dbPath in $DB_PATHS) {
    if (Test-Path $dbPath) {
        Write-Host "[INFO] Found database at: $dbPath"
        $DB_FOUND = $true

        # Copying a live SQLite file can produce an inconsistent snapshot (a
        # write in progress, or committed data still in the -wal/-journal
        # sidecar). If sqlite3.exe is on PATH use its online backup API, which
        # is always consistent; otherwise copy the file (and any sidecars) and
        # warn. Stop the server first for a guaranteed-clean plain copy.
        $sqlite = Get-Command sqlite3 -ErrorAction SilentlyContinue
        $usedSqlite = $false
        if ($sqlite) {
            & $sqlite.Source $dbPath ".backup '$BACKUP_DIR\dash.db'"
            if ($LASTEXITCODE -eq 0 -and (Test-Path "$BACKUP_DIR\dash.db")) {
                Write-Host "[OK] Database backed up with sqlite3"
                $usedSqlite = $true
            } else {
                Write-Host "[WARN] sqlite3 backup failed; falling back to a plain file copy"
            }
        }
        if (-not $usedSqlite) {
            if (-not $sqlite) {
                Write-Host "[WARN] sqlite3.exe not found on PATH; copying the database file directly."
            }
            Write-Host "[WARN] If the Dash server is running, this copy may be inconsistent."
            Copy-Item $dbPath "$BACKUP_DIR\dash.db"
            foreach ($sidecar in @("wal", "journal")) {
                if (Test-Path "$dbPath-$sidecar") {
                    Write-Host "[WARN] Database has a live $dbPath-$sidecar file; including it"
                    Copy-Item "$dbPath-$sidecar" "$BACKUP_DIR\dash.db-$sidecar"
                }
            }
            Write-Host "[OK] Database copied"
        }
        break
    }
}

if (-not $DB_FOUND) {
    Write-Host "[WARN] No database file found"
}

# Copy uploaded files: data\uploads (current location) plus server\uploads
# (legacy location used by older installs), merged into one uploads\ folder.
$UPLOADS_FOUND = $false
$UPLOAD_DIRS = @(
    "$PROJECT_DIR\data\uploads",
    "$PROJECT_DIR\server\uploads"
)
foreach ($dir in $UPLOAD_DIRS) {
    if ((Test-Path $dir) -and (Get-ChildItem -Path $dir -Force | Select-Object -First 1)) {
        Write-Host "[INFO] Backing up uploads from: $dir"
        Copy-Item -Path "$dir\*" -Destination "$BACKUP_DIR\uploads" -Recurse -Force
        $UPLOADS_FOUND = $true
    }
}
if ($UPLOADS_FOUND) {
    Write-Host "[OK] Uploads backed up"
} else {
    Write-Host "[INFO] No uploads to backup"
}

# Copy config files
Write-Host "[INFO] Backing up configuration..."
if (Test-Path "$PROJECT_DIR\server\.env") {
    Copy-Item "$PROJECT_DIR\server\.env" "$BACKUP_DIR\config\server.env"
}
if (Test-Path "$PROJECT_DIR\client\.env") {
    Copy-Item "$PROJECT_DIR\client\.env" "$BACKUP_DIR\config\client.env"
}
Write-Host "[OK] Configuration backed up"

# Create backup info
$backupInfo = @{
    created_at = (Get-Date -Format "o")
    hostname = $env:COMPUTERNAME
    backup_name = $BACKUP_NAME
} | ConvertTo-Json
$backupInfo | Out-File "$BACKUP_DIR\backup_info.json" -Encoding UTF8

# Create zip (contains dash_backup_<ts>\dash.db, \uploads\..., \config\server.env)
$ZIP_PATH = Join-Path $PROJECT_DIR "backups\$BACKUP_NAME.zip"
Write-Host "[INFO] Creating zip archive..."
Compress-Archive -Path $BACKUP_DIR -DestinationPath $ZIP_PATH -Force

# Clean up folder
Remove-Item -Recurse -Force $BACKUP_DIR

# Get file size
$size = (Get-Item $ZIP_PATH).Length
$sizeKB = [math]::Round($size / 1KB, 2)

Write-Host ""
Write-Host "========================================="
Write-Host "  Backup Complete!"
Write-Host "========================================="
Write-Host ""
Write-Host "  Backup file: $ZIP_PATH"
Write-Host "  Size: $sizeKB KB"
Write-Host "  Note: the archive contains server.env (secrets) - store it securely."
Write-Host ""
Write-Host "  To restore on Linux:"
Write-Host "    1. Copy the zip to the Linux machine"
Write-Host "    2. Run: ./scripts/restore.sh $BACKUP_NAME.zip"
Write-Host ""

# Return the path for scripting
Write-Output $ZIP_PATH
