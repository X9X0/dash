#!/bin/bash
set -e

# =============================================================================
# Dash - Update Script
# Pull latest changes from git and rebuild
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

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    log_warn "You have uncommitted changes:"
    git status --short
    echo ""
    read -p "Do you want to stash changes and continue? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git stash
        STASHED=1
    else
        log_error "Update cancelled. Please commit or stash your changes first."
        exit 1
    fi
fi

# Pull latest changes
log_info "Pulling latest changes from git..."
git pull --ff-only || {
    log_error "Git pull failed. You may need to resolve conflicts manually."
    exit 1
}
log_success "Git pull complete"

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
