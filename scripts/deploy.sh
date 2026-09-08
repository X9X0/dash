#!/bin/bash
set -e

# =============================================================================
# Dash - Deployment Script
# Supports: Ubuntu 20.04/22.04/24.04, Fedora 38/39/40, Debian 11/12
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="${DASH_DATA_DIR:-$PROJECT_DIR/data}"
# Run this script as the user that should own and run the service (it calls
# sudo itself where needed). If someone runs it via `sudo ./deploy.sh`,
# $USER is root, so fall back to the invoking user recorded in SUDO_USER.
SERVICE_USER="${DASH_USER:-${SUDO_USER:-$USER}}"

# Nginx options (set via command line)
INSTALL_NGINX=false
NGINX_ONLY=false
NGINX_DOMAIN="_"
FORCE_NGINX=false

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
# Parse Command Line Arguments
# =============================================================================
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --nginx)
                INSTALL_NGINX=true
                shift
                ;;
            --nginx-only)
                NGINX_ONLY=true
                INSTALL_NGINX=true
                shift
                ;;
            --domain=*)
                NGINX_DOMAIN="${1#*=}"
                shift
                ;;
            --force-nginx)
                FORCE_NGINX=true
                shift
                ;;
            --help|-h)
                print_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done
}

print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --nginx           Install and configure nginx reverse proxy (port 80)"
    echo "  --nginx-only      Only install/configure nginx (skip full deployment)"
    echo "  --domain=DOMAIN   Set server_name in nginx config (default: _ for all)"
    echo "  --force-nginx     Overwrite an existing nginx site config even if it contains"
    echo "                    HTTPS/certbot settings (a timestamped backup is kept)"
    echo "  --help, -h        Show this help message"
    echo ""
    echo "Run as the user that should own the service (the script uses sudo itself);"
    echo "do NOT run it as 'sudo $0'."
    echo ""
    echo "Examples:"
    echo "  $0                        # Basic deployment (port 3001 only)"
    echo "  $0 --nginx                # With nginx reverse proxy (port 80)"
    echo "  $0 --nginx --domain=dash.example.com"
    echo "  $0 --nginx-only --domain=dash.example.com  # Add nginx to existing install"
    echo "  $0 --nginx-only --force-nginx              # Replace a certbot-managed config"
}

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
        log_warn "Running as root. This script is meant to be run as the service user"
        log_warn "(it calls sudo itself); the systemd unit will run as User=$SERVICE_USER."
        if [ "$SERVICE_USER" = "root" ]; then
            log_warn "The service would run as root and the checkout would be root-owned."
            log_warn "Re-run as an unprivileged user, or set DASH_USER=<user> to override."
        fi
    else
        SUDO="sudo"
        log_info "Running as non-root user. Will use sudo for system commands."
    fi
}

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
# Install network discovery packages (LLMNR via systemd-resolved)
# =============================================================================
install_network_discovery() {
    log_info "Installing network discovery packages (LLMNR/mDNS)..."

    case $OS in
        ubuntu|debian)
            $SUDO apt-get install -y libnss-resolve
            ;;
        fedora)
            $SUDO dnf install -y systemd-resolved nss-resolve
            ;;
    esac

    # Enable LLMNR in systemd-resolved for local hostname resolution
    local RESOLVED_CONF="/etc/systemd/resolved.conf"
    if [ -f "$RESOLVED_CONF" ]; then
        if grep -q "^LLMNR=yes" "$RESOLVED_CONF"; then
            log_success "LLMNR already enabled in systemd-resolved"
        else
            log_info "Enabling LLMNR in systemd-resolved..."
            if grep -q "^#*LLMNR=" "$RESOLVED_CONF"; then
                $SUDO sed -i 's/^#*LLMNR=.*/LLMNR=yes/' "$RESOLVED_CONF"
            else
                $SUDO sed -i '/^\[Resolve\]/a LLMNR=yes' "$RESOLVED_CONF"
            fi
            $SUDO systemctl restart systemd-resolved
            log_success "LLMNR enabled"
        fi
    fi

    # Let glibc resolve names through systemd-resolved (LLMNR). Only the
    # "resolve" module is inserted; everything else already on the hosts: line
    # (mdns4_minimal, wins, myhostname, ...) is left untouched.
    nsswitch_hosts_add "resolve [!UNAVAIL=return]" before

    log_success "Network discovery packages installed"
}

# =============================================================================
# Install nginx
# =============================================================================
install_nginx() {
    if command -v nginx &> /dev/null; then
        log_success "Nginx is already installed"
        return 0
    fi

    log_info "Installing nginx..."

    case $OS in
        ubuntu|debian)
            $SUDO apt-get update
            $SUDO apt-get install -y nginx
            ;;
        fedora)
            $SUDO dnf install -y nginx
            ;;
        *)
            log_error "Unsupported OS for nginx: $OS"
            exit 1
            ;;
    esac

    log_success "Nginx installed"
}

# =============================================================================
# Configure nginx
# =============================================================================
# Install the rendered nginx config at DEST without destroying a live site:
#  - if DEST is identical, do nothing
#  - if DEST differs, keep a copy at DEST.bak.<timestamp>
#  - if DEST holds HTTPS/certbot settings, refuse unless --force-nginx was given
install_nginx_conf() {
    local SRC="$1"
    local DEST="$2"

    if $SUDO test -f "$DEST"; then
        if $SUDO cmp -s "$SRC" "$DEST"; then
            log_success "Nginx config already up to date: $DEST"
            return 0
        fi

        if $SUDO grep -qE "managed by Certbot|ssl_certificate" "$DEST"; then
            if [ "$FORCE_NGINX" != true ]; then
                local RERUN="$0 --nginx-only --force-nginx"
                if [ "$NGINX_DOMAIN" != "_" ]; then
                    RERUN="$RERUN --domain=$NGINX_DOMAIN"
                fi
                log_error "$DEST already contains an HTTPS/certbot configuration."
                log_error "Overwriting it would remove your SSL settings, so it was left untouched."
                log_info "To replace it anyway (a timestamped backup is kept), re-run with:"
                log_info "    $RERUN"
                log_info "and then re-enable HTTPS with: sudo certbot --nginx -d <your-domain>"
                rm -f "${RENDERED:-}"
                exit 1
            fi
            log_warn "$DEST contains HTTPS/certbot settings; replacing it because --force-nginx was given."
            log_warn "Re-run 'sudo certbot --nginx -d <your-domain>' afterwards to restore HTTPS."
        fi

        local BACKUP
        BACKUP="$DEST.bak.$(date +%Y%m%d_%H%M%S)"
        $SUDO cp -p "$DEST" "$BACKUP"
        log_info "Existing nginx config backed up to $BACKUP"
    fi

    $SUDO cp "$SRC" "$DEST"
    log_success "Installed nginx config: $DEST"
}

configure_nginx() {
    log_info "Configuring nginx for Dash..."

    local NGINX_CONF_SRC="$PROJECT_DIR/nginx/dash.conf"

    if [ ! -f "$NGINX_CONF_SRC" ]; then
        log_error "Nginx config not found: $NGINX_CONF_SRC"
        exit 1
    fi

    # Render the config (server_name substitution) to a temp file first so the
    # result can be compared with what is already installed.
    local RENDERED
    RENDERED=$(mktemp)
    cp "$NGINX_CONF_SRC" "$RENDERED"
    if [ "$NGINX_DOMAIN" != "_" ]; then
        sed -i "s/server_name _;/server_name $NGINX_DOMAIN;/" "$RENDERED"
    fi

    # Determine nginx config location based on OS
    case $OS in
        ubuntu|debian)
            local NGINX_CONF_DEST="/etc/nginx/sites-available/dash"
            local NGINX_ENABLED="/etc/nginx/sites-enabled/dash"

            install_nginx_conf "$RENDERED" "$NGINX_CONF_DEST"

            # Enable site
            $SUDO ln -sf "$NGINX_CONF_DEST" "$NGINX_ENABLED"

            # Disable default site if it exists
            if [ -f /etc/nginx/sites-enabled/default ]; then
                $SUDO rm -f /etc/nginx/sites-enabled/default
                log_info "Disabled default nginx site"
            fi
            ;;
        fedora)
            local NGINX_CONF_DEST="/etc/nginx/conf.d/dash.conf"

            install_nginx_conf "$RENDERED" "$NGINX_CONF_DEST"
            ;;
    esac

    rm -f "$RENDERED"

    # Test nginx configuration
    if ! $SUDO nginx -t; then
        log_error "Nginx configuration test failed"
        exit 1
    fi

    # Enable and start/reload nginx
    $SUDO systemctl enable nginx
    if $SUDO systemctl is-active --quiet nginx; then
        $SUDO systemctl reload nginx
        log_success "Nginx configuration reloaded"
    else
        $SUDO systemctl start nginx
        log_success "Nginx started"
    fi

    log_success "Nginx configured for Dash"
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
            # The example ships with NODE_ENV=development. The systemd unit sets
            # NODE_ENV=production itself, but make the file match so running
            # `node server/dist/index.js` by hand behaves like the service.
            if grep -q "^NODE_ENV=" "$PROJECT_DIR/server/.env"; then
                sed -i "s|^NODE_ENV=.*|NODE_ENV=production|" "$PROJECT_DIR/server/.env"
            else
                printf '\nNODE_ENV=production\n' >> "$PROJECT_DIR/server/.env"
            fi
        else
            cat > "$PROJECT_DIR/server/.env" << EOF
PORT=3001
DATABASE_URL=file:$DATA_DIR/dash.db
DASH_DATA_DIR=$DATA_DIR
JWT_SECRET=$(openssl rand -base64 32)
NODE_ENV=production
EOF
        fi
        chmod 600 "$PROJECT_DIR/server/.env"
        # The server refuses to start in production with a missing/placeholder secret,
        # so fail loudly here rather than at first boot.
        if ! grep -Eq '^JWT_SECRET=.{16,}$' "$PROJECT_DIR/server/.env"; then
            log_error "Could not generate JWT_SECRET (is openssl installed?). Set it in server/.env before starting."
            exit 1
        fi
        log_success "Created server/.env"
    else
        log_info "server/.env already exists, skipping..."
    fi

    # The server stores uploads in DASH_DATA_DIR/uploads, which is the directory
    # backup.sh archives. Without it uploads land in server/uploads and are never
    # backed up. Add the variable to existing .env files that predate it.
    if ! grep -q "^DASH_DATA_DIR=" "$PROJECT_DIR/server/.env"; then
        printf '\n# Data directory: uploads are stored in DASH_DATA_DIR/uploads (included in backups)\nDASH_DATA_DIR=%s\n' "$DATA_DIR" >> "$PROJECT_DIR/server/.env"
        log_success "Set DASH_DATA_DIR=$DATA_DIR in server/.env"
    fi

    # Older versions stored uploads in server/uploads. Copy them into the data
    # directory; originals are left in place until you have verified the copy.
    LEGACY_UPLOADS="$PROJECT_DIR/server/uploads"
    if [ -d "$LEGACY_UPLOADS" ] && [ -n "$(ls -A "$LEGACY_UPLOADS" 2>/dev/null)" ]; then
        log_info "Copying existing uploads from server/uploads to $DATA_DIR/uploads..."
        cp -rn "$LEGACY_UPLOADS"/. "$DATA_DIR/uploads/"
        log_success "Uploads copied. Remove server/uploads once you have verified $DATA_DIR/uploads"
    fi

    # Note: the client needs no .env file. It talks to the API with relative
    # URLs (/api, /socket.io) and reads no VITE_* variables at build time.

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

    local NODE_BIN
    NODE_BIN="$(command -v node)"
    if [ -z "$NODE_BIN" ]; then
        log_error "node not found in PATH; cannot write ExecStart for the systemd unit"
        exit 1
    fi

    # systemd accepts double quotes around individual arguments, so a project
    # path containing spaces still works.
    $SUDO tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=Dash - Robot & 3D Printer Dashboard
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROJECT_DIR
Environment=NODE_ENV=production
ExecStart=$NODE_BIN "$PROJECT_DIR/server/dist/index.js"
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
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

    # restart (not start) so a re-run of deploy.sh loads the freshly built code
    # even if an older instance is already running.
    $SUDO systemctl restart dash

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

    if [ "$INSTALL_NGINX" = true ]; then
        if [ "$NGINX_DOMAIN" != "_" ]; then
            echo -e "  ${BLUE}Application:${NC} http://$NGINX_DOMAIN"
        else
            echo -e "  ${BLUE}Application:${NC} http://localhost (port 80)"
        fi
        echo -e "  ${BLUE}Backend:${NC}     http://localhost:3001 (proxied)"
    else
        echo -e "  ${BLUE}Application:${NC} http://localhost:3001"
    fi

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

    if [ "$INSTALL_NGINX" = true ]; then
        echo ""
        echo -e "  ${YELLOW}Nginx commands:${NC}"
        echo -e "    Status:  sudo systemctl status nginx"
        echo -e "    Reload:  sudo systemctl reload nginx"
        echo -e "    Logs:    tail -f /var/log/nginx/dash_error.log"
        echo ""
        echo -e "  ${YELLOW}Enable HTTPS (Let's Encrypt):${NC}"
        echo -e "    sudo apt install certbot python3-certbot-nginx  # Ubuntu/Debian"
        echo -e "    sudo dnf install certbot python3-certbot-nginx  # Fedora"
        echo -e "    sudo certbot --nginx -d $NGINX_DOMAIN"
    fi

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
# Print nginx-only summary
# =============================================================================
print_nginx_summary() {
    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}  Nginx Configuration Complete!${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""

    if [ "$NGINX_DOMAIN" != "_" ]; then
        echo -e "  ${BLUE}Application:${NC} http://$NGINX_DOMAIN"
    else
        echo -e "  ${BLUE}Application:${NC} http://localhost (port 80)"
    fi
    echo -e "  ${BLUE}Backend:${NC}     http://localhost:3001 (proxied)"
    echo ""
    echo -e "  ${YELLOW}Nginx commands:${NC}"
    echo -e "    Status:  sudo systemctl status nginx"
    echo -e "    Reload:  sudo systemctl reload nginx"
    echo -e "    Logs:    tail -f /var/log/nginx/dash_error.log"
    echo ""
    echo -e "  ${YELLOW}Enable HTTPS (Let's Encrypt):${NC}"
    echo -e "    sudo apt install certbot python3-certbot-nginx  # Ubuntu/Debian"
    echo -e "    sudo dnf install certbot python3-certbot-nginx  # Fedora"
    echo -e "    sudo certbot --nginx -d $NGINX_DOMAIN"
    echo ""
}

# =============================================================================
# Main
# =============================================================================
main() {
    # Parse command line arguments
    parse_args "$@"

    echo ""
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${BLUE}  Dash - Deployment Script${NC}"
    echo -e "${BLUE}=========================================${NC}"
    echo ""

    if [ "$INSTALL_NGINX" = true ]; then
        log_info "Nginx reverse proxy: ENABLED"
        if [ "$NGINX_DOMAIN" != "_" ]; then
            log_info "Domain: $NGINX_DOMAIN"
        fi
    fi

    # If --nginx-only, skip full deployment and just configure nginx
    if [ "$NGINX_ONLY" = true ]; then
        log_info "Running nginx-only setup (skipping full deployment)"
        detect_os
        check_sudo
        install_nginx
        configure_nginx
        print_nginx_summary
        return 0
    fi

    detect_os
    check_sudo
    install_system_deps
    install_network_discovery
    install_node
    setup_project
    install_dependencies
    setup_database
    build_client
    create_systemd_service
    start_service

    # Install and configure nginx if requested
    if [ "$INSTALL_NGINX" = true ]; then
        install_nginx
        configure_nginx
    fi

    print_summary
}

# Run main function
main "$@"
