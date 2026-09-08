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

    # Use sqlite3's online backup API for a consistent snapshot even while the
    # server is writing.
    if command -v sqlite3 &> /dev/null; then
        sqlite3 "$DB_FILE" ".backup '$BACKUP_CONTENT_DIR/dash.db'"
    else
        # Fallback: plain file copy. A copy of a live SQLite database can be
        # inconsistent (a write in progress, or committed data still sitting in
        # the -wal/-journal sidecar). Copy the sidecars too so SQLite can
        # recover on open, and warn.
        log_warn "sqlite3 not found; copying the database file directly."
        log_warn "If the server is running, this copy may be inconsistent. Install sqlite3 or stop the service first."
        cp "$DB_FILE" "$BACKUP_CONTENT_DIR/dash.db"
        for SIDECAR in wal journal; do
            if [ -f "$DB_FILE-$SIDECAR" ]; then
                log_warn "Database has a live $DB_FILE-$SIDECAR file; including it in the backup"
                cp "$DB_FILE-$SIDECAR" "$BACKUP_CONTENT_DIR/dash.db-$SIDECAR"
            fi
        done
    fi

    log_success "Database backed up"
else
    # Fail loudly: a backup archive with no database is worse than no archive,
    # because cron wrappers would report success. Non-zero exit makes the
    # wrapper log an ERROR instead.
    log_error "No database file found to backup (looked in $DATA_DIR/dash.db, server/prisma/dev.db, server/dev.db)"
    log_error "Set DASH_DATA_DIR to the directory containing dash.db and try again."
    rm -rf "$TEMP_DIR"
    exit 1
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

# Create tarball. It contains server.env (JWT secret, SMTP password), so make
# it readable by the owner only.
log_info "Creating backup archive..."
cd "$TEMP_DIR"
tar -czf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" "$BACKUP_NAME"
chmod 600 "$BACKUP_DIR/$BACKUP_NAME.tar.gz"

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
    # Read line by line (not xargs) so paths containing spaces are handled.
    ls -1t "$BACKUP_DIR"/dash_backup_*.tar.gz | tail -n +$((KEEP_BACKUPS + 1)) | while IFS= read -r OLD_BACKUP; do
        rm -f "$OLD_BACKUP"
    done
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
