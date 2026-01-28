#!/bin/bash
set -e

# =============================================================================
# Dash - Update Script
# Pull latest changes from git and rebuild
#
# Usage: ./update.sh [OPTIONS]
#   --reset    Discard all local changes and reset to origin (production mode)
#   --stash    Automatically stash changes without prompting
#   --help     Show this help message
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

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

# Parse arguments
AUTO_RESET=0
AUTO_STASH=0
for arg in "$@"; do
    case $arg in
        --reset)
            AUTO_RESET=1
            ;;
        --stash)
            AUTO_STASH=1
            ;;
        --help)
            echo "Usage: ./update.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --reset    Discard all local changes and reset to origin (production mode)"
            echo "  --stash    Automatically stash changes without prompting"
            echo "  --help     Show this help message"
            exit 0
            ;;
    esac
done

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    SUDO=""
else
    SUDO="sudo"
fi

cd "$PROJECT_DIR"

echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  Dash - Update Script${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Clean up known build artifacts and backup files (untracked, safe to delete)
CLEANUP_PATTERNS=(
    "client/tsconfig.tsbuildinfo"
    "server/tsconfig.tsbuildinfo"
    "*.tsbuildinfo"
)
for pattern in "${CLEANUP_PATTERNS[@]}"; do
    find "$PROJECT_DIR" -name "$pattern" -type f -delete 2>/dev/null || true
done

# Check for uncommitted changes (excluding untracked files we don't care about)
MODIFIED_FILES=$(git status --porcelain | grep -v "^??" | head -20)
UNTRACKED_FILES=$(git status --porcelain | grep "^??" | head -20)

if [ -n "$MODIFIED_FILES" ] || [ -n "$UNTRACKED_FILES" ]; then
    if [ -n "$MODIFIED_FILES" ]; then
        log_warn "You have modified files:"
        echo "$MODIFIED_FILES"
        echo ""
    fi
    if [ -n "$UNTRACKED_FILES" ]; then
        log_warn "You have untracked files:"
        echo "$UNTRACKED_FILES"
        echo ""
    fi

    if [ "$AUTO_RESET" -eq 1 ]; then
        log_info "Resetting to origin (--reset flag)..."
        git checkout -- .
        git clean -fd
        log_success "Local changes discarded"
    elif [ "$AUTO_STASH" -eq 1 ]; then
        log_info "Stashing changes (--stash flag)..."
        git stash --include-untracked
        STASHED=1
        log_success "Changes stashed"
    else
        echo "Options:"
        echo "  [s] Stash changes (can restore later with 'git stash pop')"
        echo "  [r] Reset to origin (DISCARD all local changes)"
        echo "  [c] Cancel update"
        echo ""
        read -p "Choose an option [s/r/c]: " -n 1 -r
        echo
        case $REPLY in
            [Ss])
                git stash --include-untracked
                STASHED=1
                log_success "Changes stashed"
                ;;
            [Rr])
                git checkout -- .
                git clean -fd
                log_success "Local changes discarded"
                ;;
            *)
                log_error "Update cancelled."
                exit 1
                ;;
        esac
    fi
fi

# Pull latest changes
log_info "Pulling latest changes from git..."
git pull --ff-only || {
    log_error "Git pull failed. You may need to resolve conflicts manually."
    exit 1
}
log_success "Git pull complete"

# Ensure network discovery packages are installed (mDNS/NetBIOS for hostname resolution)
ensure_network_discovery() {
    if ! dpkg -s avahi-daemon libnss-mdns winbind libnss-winbind &>/dev/null 2>&1 && \
       ! rpm -q avahi nss-mdns samba-winbind &>/dev/null 2>&1; then
        log_info "Installing network discovery packages (mDNS/NetBIOS)..."
        if command -v apt-get &>/dev/null; then
            $SUDO apt-get install -y avahi-daemon libnss-mdns winbind libnss-winbind
        elif command -v dnf &>/dev/null; then
            $SUDO dnf install -y avahi nss-mdns samba-winbind samba-winbind-clients
        fi
        $SUDO systemctl enable avahi-daemon 2>/dev/null || true
        $SUDO systemctl start avahi-daemon 2>/dev/null || true
        log_success "Network discovery packages installed"
    fi

    # Ensure nsswitch.conf has wins support
    if [ -f /etc/nsswitch.conf ]; then
        if ! grep "^hosts:" /etc/nsswitch.conf | grep -q "wins"; then
            log_info "Updating /etc/nsswitch.conf for network name resolution..."
            $SUDO sed -i 's/^hosts:.*/hosts:          files mdns4_minimal [NOTFOUND=return] dns wins/' /etc/nsswitch.conf
            log_success "nsswitch.conf updated"
        fi
    fi
}
ensure_network_discovery

# Install dependencies (in case package.json changed)
log_info "Installing dependencies..."
npm install
log_success "Dependencies installed"

# Update database schema
log_info "Updating database schema..."
cd "$PROJECT_DIR/server"
npx prisma generate
npx prisma db push
log_success "Database schema updated"

# Build server
log_info "Building server..."
npm run build
log_success "Server built"

# Build client
log_info "Building client..."
cd "$PROJECT_DIR/client"
npm run build
log_success "Client built"

# Restart service if it exists
if systemctl list-units --type=service | grep -q "dash.service"; then
    log_info "Restarting Dash service..."
    $SUDO systemctl restart dash

    sleep 2

    if $SUDO systemctl is-active --quiet dash; then
        log_success "Dash service restarted"
    else
        log_error "Dash service failed to restart"
        log_info "Check logs with: journalctl -u dash -n 50"
        exit 1
    fi
else
    log_warn "Dash systemd service not found. You may need to restart manually."
    log_info "For development, run: npm run dev"
fi

# Restore stashed changes if we stashed them
if [ "${STASHED:-0}" -eq 1 ]; then
    log_info "Restoring stashed changes..."
    git stash pop || log_warn "Could not restore stashed changes"
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Update Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""

# Show what changed
log_info "Recent changes:"
git log --oneline -5
echo ""
