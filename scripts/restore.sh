#!/bin/bash
set -e

# =============================================================================
# Dash - Restore Script
# Restores database and uploads from a backup
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="${DASH_DATA_DIR:-$PROJECT_DIR/data}"

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

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    SUDO=""
else
    SUDO="sudo"
fi

usage() {
    echo "Usage: $0 <backup_file> [--no-config]"
    echo ""
    echo "Supports both .tar.gz (Linux) and .zip (Windows) backup formats."
    echo ""
    echo "Options:"
    echo "  --no-config    Don't restore .env configuration files"
    echo ""
    echo "Examples:"
    echo "  $0 dash_backup_20240123_120000.tar.gz"
    echo "  $0 dash_backup_20240123_120000.zip"
    echo "  $0 /path/to/backup.tar.gz --no-config"
    exit 1
}

# Parse arguments
BACKUP_FILE=""
RESTORE_CONFIG=1

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-config)
            RESTORE_CONFIG=0
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [ -z "$BACKUP_FILE" ]; then
                BACKUP_FILE="$1"
            else
                log_error "Unknown argument: $1"
                usage
            fi
            shift
            ;;
    esac
done

if [ -z "$BACKUP_FILE" ]; then
    log_error "No backup file specified"
    usage
fi

# Resolve backup file path
if [ ! -f "$BACKUP_FILE" ]; then
    # Try in default backup directory
    if [ -f "$DATA_DIR/backups/$BACKUP_FILE" ]; then
        BACKUP_FILE="$DATA_DIR/backups/$BACKUP_FILE"
    else
        log_error "Backup file not found: $BACKUP_FILE"
        exit 1
    fi
fi

echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  Dash - Restore Script${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

log_info "Restoring from: $BACKUP_FILE"

# Create temp directory for extraction
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Extract backup based on file type
log_info "Extracting backup..."

if [[ "$BACKUP_FILE" == *.zip ]]; then
    # Handle Windows .zip backups
    # Note: unzip automatically converts Windows backslash paths to forward slashes
    # unzip returns: 0=success, 1=warning (like backslash paths), 2+=error
    if ! command -v unzip &> /dev/null; then
        log_error "unzip command not found. Install with: sudo apt install unzip"
        exit 1
    fi
    set +e
    unzip -o -q "$BACKUP_FILE" -d "$TEMP_DIR"
    UNZIP_EXIT=$?
    set -e
    if [ $UNZIP_EXIT -gt 1 ]; then
        log_error "Failed to extract zip file (exit code: $UNZIP_EXIT)"
        exit 1
    fi

elif [[ "$BACKUP_FILE" == *.tar.gz ]] || [[ "$BACKUP_FILE" == *.tgz ]]; then
    # Handle Linux .tar.gz backups
    tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"
else
    log_error "Unsupported backup format. Use .tar.gz or .zip"
    exit 1
fi

# Find the backup content directory or database file
# Search recursively to handle various directory structures
BACKUP_CONTENT_DIR=$(find "$TEMP_DIR" -maxdepth 2 -type d -name "dash_backup_*" 2>/dev/null | head -n1)

if [ -z "$BACKUP_CONTENT_DIR" ]; then
    # Try finding database directly (flat structure or Windows path issues)
    DB_FILE=$(find "$TEMP_DIR" -name "dash.db" 2>/dev/null | head -n1)
    if [ -n "$DB_FILE" ]; then
        BACKUP_CONTENT_DIR=$(dirname "$DB_FILE")
    else
        log_error "Invalid backup format - no dash_backup_* directory or dash.db found"
        log_info "Contents of temp directory:"
        ls -laR "$TEMP_DIR"
        exit 1
    fi
fi

log_success "Backup extracted"

# Show backup info
if [ -f "$BACKUP_CONTENT_DIR/backup_info.json" ]; then
    log_info "Backup information:"
    cat "$BACKUP_CONTENT_DIR/backup_info.json"
    echo ""
fi

# Confirm restore
echo ""
log_warn "This will overwrite the current database and uploads!"
read -p "Are you sure you want to continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Restore cancelled"
    exit 0
fi

# Stop service if running
SERVICE_WAS_RUNNING=0
if systemctl list-units --type=service | grep -q "dash.service"; then
    if $SUDO systemctl is-active --quiet dash; then
        log_info "Stopping Dash service..."
        $SUDO systemctl stop dash
        SERVICE_WAS_RUNNING=1
        log_success "Service stopped"
    fi
fi

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"
mkdir -p "$DATA_DIR/uploads"

# Restore database
if [ -f "$BACKUP_CONTENT_DIR/dash.db" ]; then
    log_info "Restoring database..."

    # Backup current database just in case
    if [ -f "$DATA_DIR/dash.db" ]; then
        cp "$DATA_DIR/dash.db" "$DATA_DIR/dash.db.pre-restore"
        log_info "Current database backed up to dash.db.pre-restore"
    fi

    cp "$BACKUP_CONTENT_DIR/dash.db" "$DATA_DIR/dash.db"
    log_success "Database restored"
else
    log_warn "No database found in backup"
fi

# Restore uploads
if [ -d "$BACKUP_CONTENT_DIR/uploads" ]; then
    log_info "Restoring uploads..."

    # Backup current uploads
    if [ -d "$DATA_DIR/uploads" ] && [ "$(ls -A "$DATA_DIR/uploads" 2>/dev/null)" ]; then
        mv "$DATA_DIR/uploads" "$DATA_DIR/uploads.pre-restore"
        log_info "Current uploads backed up to uploads.pre-restore"
    fi

    cp -r "$BACKUP_CONTENT_DIR/uploads" "$DATA_DIR/uploads"
    log_success "Uploads restored"
fi

# Restore configuration (optional)
if [ "$RESTORE_CONFIG" -eq 1 ] && [ -d "$BACKUP_CONTENT_DIR/config" ]; then
    log_info "Restoring configuration..."

    if [ -f "$BACKUP_CONTENT_DIR/config/server.env" ]; then
        # Backup current .env
        if [ -f "$PROJECT_DIR/server/.env" ]; then
            cp "$PROJECT_DIR/server/.env" "$PROJECT_DIR/server/.env.pre-restore"
        fi
        cp "$BACKUP_CONTENT_DIR/config/server.env" "$PROJECT_DIR/server/.env"
        log_success "Server configuration restored"
    fi

    if [ -f "$BACKUP_CONTENT_DIR/config/client.env" ]; then
        if [ -f "$PROJECT_DIR/client/.env" ]; then
            cp "$PROJECT_DIR/client/.env" "$PROJECT_DIR/client/.env.pre-restore"
        fi
        cp "$BACKUP_CONTENT_DIR/config/client.env" "$PROJECT_DIR/client/.env"
        log_success "Client configuration restored"
    fi
else
    log_info "Skipping configuration restore (--no-config or no config in backup)"
fi

# Update database path in .env if needed
if [ -f "$PROJECT_DIR/server/.env" ]; then
    # Update DATABASE_URL to point to the correct location
    if grep -q "DATABASE_URL=" "$PROJECT_DIR/server/.env"; then
        sed -i "s|DATABASE_URL=.*|DATABASE_URL=file:$DATA_DIR/dash.db|" "$PROJECT_DIR/server/.env"
        log_info "Updated DATABASE_URL in server/.env"
    fi
fi

# Ensure database schema is up to date
log_info "Verifying database schema..."
cd "$PROJECT_DIR/server"
npx prisma db push || log_warn "Schema update failed - database may already be up to date"

# Restart service if it was running
if [ "$SERVICE_WAS_RUNNING" -eq 1 ]; then
    log_info "Starting Dash service..."
    $SUDO systemctl start dash

    sleep 2

    if $SUDO systemctl is-active --quiet dash; then
        log_success "Service started"
    else
        log_error "Service failed to start. Check logs: journalctl -u dash -n 50"
    fi
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Restore Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "  ${BLUE}Database:${NC} $DATA_DIR/dash.db"
echo -e "  ${BLUE}Uploads:${NC} $DATA_DIR/uploads"
echo ""
echo -e "  ${YELLOW}Previous data backed up with .pre-restore suffix${NC}"
echo ""
