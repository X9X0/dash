#!/bin/bash
set -e

# =============================================================================
# Dash - Update Script
# Pull latest changes from git and rebuild
#
# Usage: ./update.sh [OPTIONS]
#   --reset           Discard all local changes and reset to origin (production mode)
#   --stash           Automatically stash changes without prompting
#   --branch <name>   Check out and update to the given branch (default: current)
#   --help            Show this help message
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

# Parse arguments
AUTO_RESET=0
AUTO_STASH=0
TARGET_BRANCH=""
while [ $# -gt 0 ]; do
    case $1 in
        --reset)
            AUTO_RESET=1
            ;;
        --stash)
            AUTO_STASH=1
            ;;
        --branch)
            TARGET_BRANCH="$2"
            if [ -z "$TARGET_BRANCH" ]; then
                echo "Error: --branch requires a branch name" >&2
                exit 1
            fi
            shift
            ;;
        --help)
            echo "Usage: ./update.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --reset           Discard all local changes and reset to origin (production mode)"
            echo "  --stash           Automatically stash changes without prompting"
            echo "  --branch <name>   Check out and update to the given branch (default: current)"
            echo "  --help            Show this help message"
            exit 0
            ;;
    esac
    shift
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

# Clean up TypeScript incremental build info (untracked, safe to delete).
# Restricted to client/ and server/ and skips node_modules so the walk is cheap.
find "$PROJECT_DIR/client" "$PROJECT_DIR/server" \
    -path '*/node_modules' -prune -o -name '*.tsbuildinfo' -type f -print0 2>/dev/null \
    | xargs -0 -r rm -f

# Discard local changes and move to the exact state of origin/<branch>.
# Fetch FIRST so a network failure leaves the working tree untouched, then hard
# reset (which also handles a diverged local branch that `pull --ff-only`
# would refuse). The later `git pull` is skipped when this ran.
reset_to_origin() {
    log_info "Fetching from origin..."
    git fetch origin || {
        log_error "git fetch failed. Nothing was changed."
        exit 1
    }

    local CURRENT_BRANCH
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    local BRANCH="${TARGET_BRANCH:-$CURRENT_BRANCH}"

    if ! git rev-parse --verify -q "origin/$BRANCH" > /dev/null; then
        log_error "Branch '$BRANCH' does not exist on origin. Nothing was changed."
        exit 1
    fi

    if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
        log_info "Switching to branch '$BRANCH'..."
        git checkout -f -B "$BRANCH" "origin/$BRANCH"
    fi

    log_info "Resetting to origin/$BRANCH..."
    git reset --hard "origin/$BRANCH"
    git clean -fd -e uploads -e scripts/backup-cron.sh
    RESET_DONE=1
    log_success "Local changes discarded; now at origin/$BRANCH"
}

RESET_DONE=0

# Check for uncommitted changes (excluding untracked files we don't care about)
MODIFIED_FILES=$(git status --porcelain | grep -v "^??" | head -20)
UNTRACKED_FILES=$(git status --porcelain | grep "^??" | head -20)

if [ "$AUTO_RESET" -eq 1 ]; then
    log_info "Resetting to origin (--reset flag)..."
    reset_to_origin
elif [ -n "$MODIFIED_FILES" ] || [ -n "$UNTRACKED_FILES" ]; then
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

    if [ "$AUTO_STASH" -eq 1 ]; then
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
                reset_to_origin
                ;;
            *)
                log_error "Update cancelled."
                exit 1
                ;;
        esac
    fi
fi

if [ "$RESET_DONE" -ne 1 ]; then
    # Switch to the requested branch (if any) before pulling
    if [ -n "$TARGET_BRANCH" ]; then
        log_info "Fetching from origin..."
        git fetch origin || {
            log_error "git fetch failed."
            exit 1
        }
        CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
        if [ "$CURRENT_BRANCH" != "$TARGET_BRANCH" ]; then
            log_info "Switching to branch '$TARGET_BRANCH'..."
            git checkout "$TARGET_BRANCH" || {
                log_error "Could not check out branch '$TARGET_BRANCH'. Does it exist on origin?"
                exit 1
            }
            log_success "On branch '$TARGET_BRANCH'"
        fi
    fi

    # Pull latest changes
    log_info "Pulling latest changes from git..."
    git pull --ff-only || {
        log_error "Git pull failed. You may need to resolve conflicts manually."
        log_info "On a production server, use: ./scripts/update.sh --reset"
        exit 1
    }
    log_success "Git pull complete"
fi

# Make sure uploads live in the data directory (the one backup.sh archives).
# Installs that predate DASH_DATA_DIR stored them in server/uploads, which was
# never backed up. Copy them over; originals are left in place.
if [ -f "$PROJECT_DIR/server/.env" ]; then
    if ! grep -q "^DASH_DATA_DIR=" "$PROJECT_DIR/server/.env"; then
        mkdir -p "$DATA_DIR/uploads"
        printf '\n# Data directory: uploads are stored in DASH_DATA_DIR/uploads (included in backups)\nDASH_DATA_DIR=%s\n' "$DATA_DIR" >> "$PROJECT_DIR/server/.env"
        log_success "Set DASH_DATA_DIR=$DATA_DIR in server/.env"
    fi
    LEGACY_UPLOADS="$PROJECT_DIR/server/uploads"
    if [ -d "$LEGACY_UPLOADS" ] && [ -n "$(ls -A "$LEGACY_UPLOADS" 2>/dev/null)" ]; then
        mkdir -p "$DATA_DIR/uploads"
        log_info "Copying existing uploads from server/uploads to $DATA_DIR/uploads..."
        cp -rn "$LEGACY_UPLOADS"/. "$DATA_DIR/uploads/"
        log_success "Uploads copied. Remove server/uploads once you have verified $DATA_DIR/uploads"
    fi
fi

# =============================================================================
# Idempotently add NSS modules to the "hosts:" line of /etc/nsswitch.conf
# =============================================================================
# Usage: nsswitch_hosts_add "<tokens>" before|after
#   nsswitch_hosts_add "mdns4_minimal [NOTFOUND=return]" before   # before "dns"
#   nsswitch_hosts_add "wins" after                                # after "dns"
# Never rewrites the whole line: distro defaults such as "myhostname" or
# "mymachines" are preserved, and nothing changes if the module is already
# listed. The first word of <tokens> is the module name that is checked for.
# NOTE: deploy.sh and update.sh carry identical copies of this function.
nsswitch_hosts_add() {
    local TOKENS="$1"
    local WHERE="${2:-before}"
    local MODULE="${TOKENS%% *}"
    local NSSWITCH="/etc/nsswitch.conf"

    [ -f "$NSSWITCH" ] || return 0

    if ! grep -q "^hosts:" "$NSSWITCH"; then
        log_info "Adding missing hosts: line to $NSSWITCH..."
        echo "hosts:          files dns" | $SUDO tee -a "$NSSWITCH" > /dev/null
    fi

    if grep "^hosts:" "$NSSWITCH" | grep -qw "$MODULE"; then
        return 0
    fi

    log_info "Adding '$TOKENS' to the hosts: line of $NSSWITCH..."
    if grep "^hosts:" "$NSSWITCH" | grep -qw "dns"; then
        if [ "$WHERE" = "after" ]; then
            $SUDO sed -i -e "/^hosts:/ s/\<dns\>/dns $TOKENS/" "$NSSWITCH"
        else
            $SUDO sed -i -e "/^hosts:/ s/\<dns\>/$TOKENS dns/" "$NSSWITCH"
        fi
    else
        # No dns module on the line: append at the end
        $SUDO sed -i -e "/^hosts:/ s/[[:space:]]*$/ $TOKENS/" "$NSSWITCH"
    fi
    log_success "nsswitch.conf hosts line is now: $(grep -m1 '^hosts:' "$NSSWITCH" | sed 's/^hosts:[[:space:]]*//')"
}

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

    # Make sure the mDNS and NetBIOS (wins) modules are on the hosts: line.
    # Only missing tokens are inserted; whatever else is there (resolve,
    # myhostname, ...) is preserved.
    nsswitch_hosts_add "mdns4_minimal [NOTFOUND=return]" before
    nsswitch_hosts_add "wins" after
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

# Restart service if it exists (list-unit-files also finds inactive units)
if systemctl list-unit-files --type=service 2>/dev/null | grep -q '^dash.service'; then
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
