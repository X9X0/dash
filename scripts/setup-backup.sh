#!/bin/bash

# =============================================================================
# Dash - Setup Automated Backup
# Configures cron job for daily backups with optional SSH transfer
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="${DASH_CONFIG_DIR:-/etc/dash}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --daily              Enable daily backups at 2 AM"
    echo "  --hourly             Enable hourly backups"
    echo "  --ssh USER@HOST:PATH Enable SSH transfer to remote server"
    echo "  --keep N             Keep last N backups (default: 30)"
    echo "  --disable            Disable automated backups"
    echo "  --status             Show current backup configuration"
    echo ""
    echo "Examples:"
    echo "  $0 --daily"
    echo "  $0 --daily --ssh user@backup-server:/backups/dash"
    echo "  $0 --daily --ssh user@server:/backups --keep 14"
    echo "  $0 --disable"
    exit 0
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    SUDO=""
else
    SUDO="sudo"
fi

# Parse arguments
SCHEDULE=""
SSH_TARGET=""
KEEP_BACKUPS=30
ACTION=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --daily)
            SCHEDULE="daily"
            shift
            ;;
        --hourly)
            SCHEDULE="hourly"
            shift
            ;;
        --ssh)
            SSH_TARGET="$2"
            shift 2
            ;;
        --keep)
            KEEP_BACKUPS="$2"
            shift 2
            ;;
        --disable)
            ACTION="disable"
            shift
            ;;
        --status)
            ACTION="status"
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Handle status check
if [ "$ACTION" = "status" ]; then
    echo ""
    echo -e "${BLUE}Dash Backup Configuration${NC}"
    echo "========================="

    if [ -f "$CONFIG_DIR/backup.conf" ]; then
        cat "$CONFIG_DIR/backup.conf"
    else
        echo "No backup configuration found."
    fi

    echo ""
    echo "Cron jobs:"
    crontab -l 2>/dev/null | grep -E "dash.*backup" || echo "No backup cron jobs found."
    echo ""
    exit 0
fi

# Handle disable
if [ "$ACTION" = "disable" ]; then
    log_info "Disabling automated backups..."

    # Remove cron job
    crontab -l 2>/dev/null | grep -v "dash.*backup" | crontab - 2>/dev/null || true

    # Remove config
    $SUDO rm -f "$CONFIG_DIR/backup.conf" 2>/dev/null || true

    log_success "Automated backups disabled"
    exit 0
fi

# Require schedule for setup
if [ -z "$SCHEDULE" ]; then
    log_error "Please specify --daily or --hourly"
    usage
fi

echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  Dash - Setup Automated Backup${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Create config directory
$SUDO mkdir -p "$CONFIG_DIR"

# Create backup configuration
log_info "Creating backup configuration..."

$SUDO tee "$CONFIG_DIR/backup.conf" > /dev/null << EOF
# Dash Backup Configuration
# Generated: $(date)

DASH_PROJECT_DIR=$PROJECT_DIR
DASH_KEEP_BACKUPS=$KEEP_BACKUPS
DASH_SSH_TARGET=$SSH_TARGET
DASH_SCHEDULE=$SCHEDULE
EOF

log_success "Configuration saved to $CONFIG_DIR/backup.conf"

# Create the backup wrapper script
BACKUP_WRAPPER="$SCRIPT_DIR/backup-cron.sh"

cat > "$BACKUP_WRAPPER" << 'WRAPPER'
#!/bin/bash
# Dash automated backup wrapper

# Load configuration
CONFIG_FILE="${DASH_CONFIG_DIR:-/etc/dash}/backup.conf"
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

PROJECT_DIR="${DASH_PROJECT_DIR:-$(dirname $(dirname $0))}"
BACKUP_SCRIPT="$PROJECT_DIR/scripts/backup.sh"
LOG_FILE="/var/log/dash-backup.log"

# Run backup
echo "[$(date)] Starting backup..." >> "$LOG_FILE" 2>&1
BACKUP_FILE=$("$BACKUP_SCRIPT" 2>> "$LOG_FILE" | tail -n1)

if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
    echo "[$(date)] Backup created: $BACKUP_FILE" >> "$LOG_FILE"

    # SSH transfer if configured
    if [ -n "$DASH_SSH_TARGET" ]; then
        echo "[$(date)] Transferring to $DASH_SSH_TARGET..." >> "$LOG_FILE"
        scp "$BACKUP_FILE" "$DASH_SSH_TARGET/" >> "$LOG_FILE" 2>&1

        if [ $? -eq 0 ]; then
            echo "[$(date)] Transfer complete" >> "$LOG_FILE"
        else
            echo "[$(date)] ERROR: Transfer failed" >> "$LOG_FILE"
        fi
    fi

    echo "[$(date)] Backup complete" >> "$LOG_FILE"
else
    echo "[$(date)] ERROR: Backup failed" >> "$LOG_FILE"
fi
WRAPPER

chmod +x "$BACKUP_WRAPPER"
log_success "Backup wrapper script created"

# Setup cron job
log_info "Setting up cron job..."

# Remove existing dash backup cron jobs
CURRENT_CRON=$(crontab -l 2>/dev/null | grep -v "dash.*backup" || true)

# Add new cron job
case $SCHEDULE in
    daily)
        CRON_SCHEDULE="0 2 * * *"  # 2 AM daily
        ;;
    hourly)
        CRON_SCHEDULE="0 * * * *"  # Every hour
        ;;
esac

NEW_CRON="$CURRENT_CRON
$CRON_SCHEDULE $BACKUP_WRAPPER  # dash automated backup"

echo "$NEW_CRON" | crontab -

log_success "Cron job configured ($SCHEDULE at ${CRON_SCHEDULE})"

# Test SSH connection if configured
if [ -n "$SSH_TARGET" ]; then
    log_info "Testing SSH connection to $SSH_TARGET..."

    # Extract host from target
    SSH_HOST=$(echo "$SSH_TARGET" | cut -d: -f1)

    if ssh -o BatchMode=yes -o ConnectTimeout=5 "$SSH_HOST" "echo ok" &>/dev/null; then
        log_success "SSH connection successful"
    else
        log_warn "SSH connection failed. Please ensure:"
        log_warn "  1. SSH key is set up (ssh-copy-id $SSH_HOST)"
        log_warn "  2. Target directory exists"
        log_warn "Backups will still be created locally."
    fi
fi

# Create log file
$SUDO touch /var/log/dash-backup.log
$SUDO chmod 666 /var/log/dash-backup.log

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Automated Backup Configured!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "  ${BLUE}Schedule:${NC} $SCHEDULE ($CRON_SCHEDULE)"
echo -e "  ${BLUE}Keep backups:${NC} $KEEP_BACKUPS"
if [ -n "$SSH_TARGET" ]; then
echo -e "  ${BLUE}SSH target:${NC} $SSH_TARGET"
fi
echo -e "  ${BLUE}Log file:${NC} /var/log/dash-backup.log"
echo ""
echo -e "  ${YELLOW}Commands:${NC}"
echo -e "    View logs: tail -f /var/log/dash-backup.log"
echo -e "    Run now:   $BACKUP_WRAPPER"
echo -e "    Status:    $0 --status"
echo -e "    Disable:   $0 --disable"
echo ""
