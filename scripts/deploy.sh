#!/bin/bash
set -e

# =============================================================================
# Dash - Deployment Script
# Supports: Ubuntu 20.04/22.04/24.04, Fedora 38/39/40, Debian 11/12
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="${DASH_DATA_DIR:-$PROJECT_DIR/data}"
SERVICE_USER="${DASH_USER:-$USER}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# OS Detection
# =============================================================================
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
        log_info "Detected OS: $OS $VERSION"
    else
        log_error "Cannot detect OS. /etc/os-release not found."
        exit 1
    fi
}

# =============================================================================
# Check if running as root (for system-wide install)
# =============================================================================
check_sudo() {
    if [ "$EUID" -eq 0 ]; then
        SUDO=""
    else
        SUDO="sudo"
        log_info "Running as non-root user. Will use sudo for system commands."
    fi
}

# =============================================================================
# Install Node.js 20 LTS
# =============================================================================
install_node() {
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            log_success "Node.js $(node -v) is already installed"
            return 0
        else
            log_warn "Node.js version is too old. Installing Node.js 20..."
        fi
    else
        log_info "Node.js not found. Installing Node.js 20 LTS..."
    fi

    case $OS in
        ubuntu|debian)
            log_info "Installing Node.js via NodeSource repository..."
            $SUDO apt-get update
            $SUDO apt-get install -y ca-certificates curl gnupg
            $SUDO mkdir -p /etc/apt/keyrings
            curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | $SUDO gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
            echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | $SUDO tee /etc/apt/sources.list.d/nodesource.list
            $SUDO apt-get update
            $SUDO apt-get install -y nodejs
            ;;
        fedora)
            log_info "Installing Node.js via dnf..."
            $SUDO dnf install -y nodejs npm
            ;;
        *)
            log_error "Unsupported OS: $OS"
            log_info "Please install Node.js 20+ manually and re-run this script."
            exit 1
            ;;
    esac

    log_success "Node.js $(node -v) installed"
}

# =============================================================================
# Install system dependencies
# =============================================================================
install_system_deps() {
    log_info "Installing system dependencies..."

    case $OS in
        ubuntu|debian)
            $SUDO apt-get update
            $SUDO apt-get install -y git sqlite3 build-essential
            ;;
        fedora)
            $SUDO dnf install -y git sqlite gcc-c++ make
            ;;
    esac

    log_success "System dependencies installed"
}

# =============================================================================
# Setup project
# =============================================================================
setup_project() {
    log_info "Setting up project..."

    cd "$PROJECT_DIR"

    # Create data directory
    mkdir -p "$DATA_DIR"
    mkdir -p "$DATA_DIR/uploads"
    mkdir -p "$DATA_DIR/backups"

    # Create .env files if they don't exist
    if [ ! -f "$PROJECT_DIR/server/.env" ]; then
        log_info "Creating server/.env from example..."
        if [ -f "$PROJECT_DIR/server/.env.example" ]; then
            cp "$PROJECT_DIR/server/.env.example" "$PROJECT_DIR/server/.env"
            # Generate a random JWT secret
            JWT_SECRET=$(openssl rand -base64 32)
            sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$PROJECT_DIR/server/.env"
            sed -i "s|DATABASE_URL=.*|DATABASE_URL=file:$DATA_DIR/dash.db|" "$PROJECT_DIR/server/.env"
        else
            cat > "$PROJECT_DIR/server/.env" << EOF
PORT=3001
DATABASE_URL=file:$DATA_DIR/dash.db
JWT_SECRET=$(openssl rand -base64 32)
NODE_ENV=production
EOF
        fi
        log_success "Created server/.env"
    else
        log_info "server/.env already exists, skipping..."
    fi

    if [ ! -f "$PROJECT_DIR/client/.env" ]; then
        log_info "Creating client/.env from example..."
        if [ -f "$PROJECT_DIR/client/.env.example" ]; then
            cp "$PROJECT_DIR/client/.env.example" "$PROJECT_DIR/client/.env"
        else
            cat > "$PROJECT_DIR/client/.env" << EOF
VITE_API_URL=http://localhost:3001
EOF
        fi
        log_success "Created client/.env"
    else
        log_info "client/.env already exists, skipping..."
    fi

    log_success "Project directories created"
}

# =============================================================================
# Install npm dependencies
# =============================================================================
install_dependencies() {
    log_info "Installing npm dependencies..."

    cd "$PROJECT_DIR"
    npm install

    log_success "Dependencies installed"
}

# =============================================================================
# Setup database
# =============================================================================
setup_database() {
    log_info "Setting up database..."

    cd "$PROJECT_DIR/server"

    # Check if this is a fresh database (for seeding decision)
    local NEEDS_SEED=false
    if [ ! -f "$DATA_DIR/dash.db" ]; then
        NEEDS_SEED=true
    fi

    # Generate Prisma client
    npx prisma generate

    # Push schema to database (creates tables)
    npx prisma db push

    # Seed database if it's fresh
    if [ "$NEEDS_SEED" = true ]; then
        log_info "Seeding database with initial data..."
        npx prisma db seed || log_warn "Seed script failed, skipping..."
    fi

    log_success "Database setup complete"
}

# =============================================================================
# Build client
# =============================================================================
build_client() {
    log_info "Building client..."

    cd "$PROJECT_DIR/client"
    npm run build

    log_success "Client built"
}

# =============================================================================
# Create systemd service
# =============================================================================
create_systemd_service() {
    log_info "Creating systemd service..."

    SERVICE_FILE="/etc/systemd/system/dash.service"

    $SUDO tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=Dash - Robot & 3D Printer Dashboard
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROJECT_DIR
Environment=NODE_ENV=production
ExecStart=$(which node) $PROJECT_DIR/server/dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=dash

[Install]
WantedBy=multi-user.target
EOF

    # Build server for production
    log_info "Building server..."
    cd "$PROJECT_DIR/server"
    npm run build

    $SUDO systemctl daemon-reload
    $SUDO systemctl enable dash

    log_success "Systemd service created and enabled"
}

# =============================================================================
# Start service
# =============================================================================
start_service() {
    log_info "Starting Dash service..."

    $SUDO systemctl start dash

    sleep 2

    if $SUDO systemctl is-active --quiet dash; then
        log_success "Dash service is running"
        log_info "View logs with: journalctl -u dash -f"
    else
        log_error "Dash service failed to start"
        log_info "Check logs with: journalctl -u dash -n 50"
        exit 1
    fi
}

# =============================================================================
# Print summary
# =============================================================================
print_summary() {
    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}  Dash Deployment Complete!${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo -e "  ${BLUE}Application:${NC} http://localhost:3001"
    echo -e "  ${BLUE}Data directory:${NC} $DATA_DIR"
    echo -e "  ${BLUE}Database:${NC} $DATA_DIR/dash.db"
    echo ""
    echo -e "  ${YELLOW}Default login:${NC}"
    echo -e "    Email:    admin@example.com"
    echo -e "    Password: admin123"
    echo ""
    echo -e "  ${YELLOW}Useful commands:${NC}"
    echo -e "    Start:   sudo systemctl start dash"
    echo -e "    Stop:    sudo systemctl stop dash"
    echo -e "    Restart: sudo systemctl restart dash"
    echo -e "    Logs:    journalctl -u dash -f"
    echo -e "    Update:  ./scripts/update.sh"
    echo -e "    Backup:  ./scripts/backup.sh"
    echo ""
    echo -e "  ${YELLOW}Restore from backup:${NC}"
    echo -e "  If you have a backup file, restore your data with:"
    echo ""
    echo -e "    sudo systemctl stop dash"
    echo -e "    ./scripts/restore.sh /path/to/backup.tar.gz"
    echo -e "    sudo systemctl start dash"
    echo ""
}

# =============================================================================
# Main
# =============================================================================
main() {
    echo ""
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${BLUE}  Dash - Deployment Script${NC}"
    echo -e "${BLUE}=========================================${NC}"
    echo ""

    detect_os
    check_sudo
    install_system_deps
    install_node
    setup_project
    install_dependencies
    setup_database
    build_client
    create_systemd_service
    start_service
    print_summary
}

# Run main function
main "$@"
