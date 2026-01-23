#!/bin/bash
set -e

# =============================================================================
# Dash - Backup Script
# Creates a backup of the database and uploads
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="${DASH_DATA_DIR:-$PROJECT_DIR/data}"
BACKUP_DIR="${1:-$DATA_DIR/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="dash_backup_$TIMESTAMP"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  Dash - Backup Script${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"
TEMP_DIR=$(mktemp -d)
BACKUP_CONTENT_DIR="$TEMP_DIR/$BACKUP_NAME"
mkdir -p "$BACKUP_CONTENT_DIR"

log_info "Creating backup: $BACKUP_NAME"
log_info "Backup directory: $BACKUP_DIR"

# Find and backup database
DB_FILE=""
if [ -f "$DATA_DIR/dash.db" ]; then
    DB_FILE="$DATA_DIR/dash.db"
elif [ -f "$PROJECT_DIR/server/prisma/dev.db" ]; then
    DB_FILE="$PROJECT_DIR/server/prisma/dev.db"
elif [ -f "$PROJECT_DIR/server/dev.db" ]; then
    DB_FILE="$PROJECT_DIR/server/dev.db"
fi

if [ -n "$DB_FILE" ] && [ -f "$DB_FILE" ]; then
    log_info "Backing up database: $DB_FILE"

    # Use sqlite3 backup command for a consistent backup
    if command -v sqlite3 &> /dev/null; then
        sqlite3 "$DB_FILE" ".backup '$BACKUP_CONTENT_DIR/dash.db'"
    else
        # Fallback to cp if sqlite3 not available
        cp "$DB_FILE" "$BACKUP_CONTENT_DIR/dash.db"
    fi

    log_success "Database backed up"
else
    log_warn "No database file found to backup"
fi

# Backup uploads directory if it exists
if [ -d "$DATA_DIR/uploads" ] && [ "$(ls -A "$DATA_DIR/uploads" 2>/dev/null)" ]; then
    log_info "Backing up uploads..."
    cp -r "$DATA_DIR/uploads" "$BACKUP_CONTENT_DIR/uploads"
    log_success "Uploads backed up"
else
    log_info "No uploads to backup"
    mkdir -p "$BACKUP_CONTENT_DIR/uploads"
fi

# Backup .env files (without secrets exposed in filename)
log_info "Backing up configuration..."
mkdir -p "$BACKUP_CONTENT_DIR/config"

if [ -f "$PROJECT_DIR/server/.env" ]; then
    cp "$PROJECT_DIR/server/.env" "$BACKUP_CONTENT_DIR/config/server.env"
fi

if [ -f "$PROJECT_DIR/client/.env" ]; then
    cp "$PROJECT_DIR/client/.env" "$BACKUP_CONTENT_DIR/config/client.env"
fi

log_success "Configuration backed up"

# Create backup metadata
cat > "$BACKUP_CONTENT_DIR/backup_info.json" << EOF
{
    "created_at": "$(date -Iseconds)",
    "hostname": "$(hostname)",
    "dash_version": "1.0.0",
    "database_file": "$DB_FILE",
    "backup_name": "$BACKUP_NAME"
}
EOF

# Create tarball
log_info "Creating backup archive..."
cd "$TEMP_DIR"
tar -czf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" "$BACKUP_NAME"

# Cleanup temp directory
rm -rf "$TEMP_DIR"

# Calculate size
BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_NAME.tar.gz" | cut -f1)

log_success "Backup created: $BACKUP_DIR/$BACKUP_NAME.tar.gz ($BACKUP_SIZE)"

# Clean up old backups (keep last 30 by default)
KEEP_BACKUPS=${DASH_KEEP_BACKUPS:-30}
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/dash_backup_*.tar.gz 2>/dev/null | wc -l)

if [ "$BACKUP_COUNT" -gt "$KEEP_BACKUPS" ]; then
    log_info "Cleaning up old backups (keeping last $KEEP_BACKUPS)..."
    ls -1t "$BACKUP_DIR"/dash_backup_*.tar.gz | tail -n +$((KEEP_BACKUPS + 1)) | xargs rm -f
    log_success "Old backups cleaned up"
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Backup Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "  ${BLUE}Backup file:${NC} $BACKUP_DIR/$BACKUP_NAME.tar.gz"
echo -e "  ${BLUE}Size:${NC} $BACKUP_SIZE"
echo ""
echo -e "  ${YELLOW}To restore on another machine:${NC}"
echo -e "    1. Copy the backup file to the target machine"
echo -e "    2. Run: ./scripts/restore.sh $BACKUP_NAME.tar.gz"
echo ""

# Output just the filename for scripting
echo "$BACKUP_DIR/$BACKUP_NAME.tar.gz"
