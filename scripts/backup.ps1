# Dash - Windows Backup Script (PowerShell)

$PROJECT_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $PROJECT_DIR) { $PROJECT_DIR = "C:\Users\Steve Cap\Documents\Dash" }

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
        Copy-Item $dbPath "$BACKUP_DIR\dash.db"
        Write-Host "[OK] Database copied"
        $DB_FOUND = $true
        break
    }
}

if (-not $DB_FOUND) {
    Write-Host "[WARN] No database file found"
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

# Create zip
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
Write-Host ""
Write-Host "  To restore on Linux:"
Write-Host "    1. Copy the zip to the Linux machine"
Write-Host "    2. Run: ./scripts/restore.sh $BACKUP_NAME.zip"
Write-Host ""

# Return the path for scripting
Write-Output $ZIP_PATH
