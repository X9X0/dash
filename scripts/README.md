# Dash Deployment Scripts

## Quick Start

### On Windows (Development)
```batch
# Create a backup to take to dev machine
scripts\backup.bat
```

### On Linux (Dev/Production Machine)

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Deploy (first time setup)
./scripts/deploy.sh

# Update from git
./scripts/update.sh

# Create backup
./scripts/backup.sh

# Restore from backup
./scripts/restore.sh dash_backup_20240123_120000.tar.gz
```

## Scripts Overview

| Script | Platform | Purpose |
|--------|----------|---------|
| `deploy.sh` | Linux | Full deployment: installs Node, deps, builds, creates systemd service |
| `update.sh` | Linux | Pull latest from git, rebuild, restart service |
| `backup.sh` | Linux | Create timestamped backup of database, uploads and config |
| `restore.sh` | Linux | Restore from a backup file (`.tar.gz` or Windows `.zip`) |
| `setup-backup.sh` | Linux | Configure automated daily backups |
| `backup.bat` | Windows | Windows backup script (batch): database, uploads, config |
| `backup.ps1` | Windows | Windows backup script (PowerShell): database, uploads, config |

All Linux scripts are meant to be run as the unprivileged user that owns the checkout and runs the service. They call `sudo` themselves where needed — do **not** run them as `sudo ./scripts/deploy.sh`, or the service and files end up owned by root.

## Deployment Steps

### 1. Clone the repository
```bash
git clone <your-repo-url> dash
cd dash
```

### 2. Run deployment script
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

This will:
- Detect your OS (Ubuntu, Debian, Fedora)
- Install Node.js 20 LTS if needed
- Install system dependencies (`git`, `sqlite3`, build tools)
- Install `libnss-resolve` and enable LLMNR in systemd-resolved for local hostname lookups (edits `/etc/systemd/resolved.conf`, and inserts the `resolve` module into the `hosts:` line of `/etc/nsswitch.conf` without touching anything else on that line)
- Create data directories
- Generate `server/.env` with secure defaults (`JWT_SECRET`, `DATABASE_URL`, `DASH_DATA_DIR`, `NODE_ENV=production`) — the client needs no `.env`
- Install npm packages
- Setup database with Prisma (`prisma db push`)
- Build client and server
- Create and start systemd service (re-running the script restarts it with the new build)

### 3. Access the application
```
http://localhost:3001
```

## Updating

After making changes and pushing to git:

```bash
./scripts/update.sh
```

This will:
- Pull latest changes (`--reset` fetches first, then hard-resets to `origin/<branch>`, so a diverged production checkout is recovered instead of failing; local changes and commits are discarded)
- Install the mDNS/NetBIOS name-resolution packages (`avahi-daemon`, `libnss-mdns`, `winbind`, `libnss-winbind`; on Fedora `avahi`, `nss-mdns`, `samba-winbind`) if they are missing, and insert `mdns4_minimal [NOTFOUND=return]` / `wins` into the `hosts:` line of `/etc/nsswitch.conf` — only the missing tokens are added, existing entries are preserved
- Install any new dependencies
- Apply schema changes (`prisma db push` — this project has no Prisma migrations)
- Rebuild client and server
- Restart the service

Options: `--reset`, `--stash`, `--branch <name>`, `--help`.

## Backup & Restore

### Create a backup
```bash
./scripts/backup.sh
# Output: data/backups/dash_backup_20240123_120000.tar.gz
```

The archive (`dash_backup_<timestamp>/` with `dash.db`, `uploads/`, `config/server.env`, `backup_info.json`) is created with mode `600` because `server.env` contains secrets. The database is snapshotted with `sqlite3 .backup` when `sqlite3` is installed (consistent even while the server runs); without it a plain copy is made and a warning is printed. The script exits non-zero if no database is found, so a cron run cannot silently "succeed" with an empty archive.

### Restore from backup
```bash
./scripts/restore.sh dash_backup_20240123_120000.tar.gz
./scripts/restore.sh dash_backup_20240123_120000.zip        # Windows backup
```

`restore.sh` stops the service, keeps `dash.db.pre-restore` / `uploads.pre-restore` safety copies (replacing ones from a previous restore), removes stale SQLite sidecar files (`dash.db-journal`, `-wal`, `-shm`) before swapping the database, restores the uploads *contents* into `data/uploads/`, runs `prisma db push`, and starts the service again.

### Transfer backup to new machine
```bash
# On source machine
scp data/backups/dash_backup_*.tar.gz user@newmachine:/path/to/dash/

# On target machine
./scripts/restore.sh /path/to/dash_backup_*.tar.gz
```

### Automated daily backups
```bash
# Enable daily backups at 2 AM
./scripts/setup-backup.sh --daily

# With SSH transfer to remote server
./scripts/setup-backup.sh --daily --ssh user@backup-server:/backups/dash

# Keep only the last 14 archives
./scripts/setup-backup.sh --daily --keep 14

# Check status
./scripts/setup-backup.sh --status

# Disable
./scripts/setup-backup.sh --disable
```

This writes `/etc/dash/backup.conf` (`DASH_PROJECT_DIR`, `DASH_DATA_DIR`, `DASH_KEEP_BACKUPS`, `DASH_SSH_TARGET`, `DASH_SCHEDULE`), generates `scripts/backup-cron.sh` (git-ignored) which exports those settings and runs `backup.sh`, and adds one line tagged `# dash automated backup` to your crontab. The log `/var/log/dash-backup.log` is owned by the invoking user with mode `644`.

## Service Management

```bash
# Start
sudo systemctl start dash

# Stop
sudo systemctl stop dash

# Restart
sudo systemctl restart dash

# View status
sudo systemctl status dash

# View logs
journalctl -u dash -f
```

## Configuration

### Server (.env)
```env
PORT=3001
DATABASE_URL=file:/path/to/data/dash.db
DASH_DATA_DIR=/path/to/data
JWT_SECRET=your-secret-key
NODE_ENV=production
```

See the configuration reference in the [main README](../README.md#configuration-reference) for every variable (`CLIENT_URL`, `TRUST_PROXY`, SMTP, BamBuddy, ...).

### Client (.env)

Not needed. The client uses relative URLs (`/api`, Socket.io on `/`) and reads no `VITE_*` variables; a `client/.env` file is ignored.

## Directory Structure (Deployed)

```
dash/
├── client/              # React frontend
│   └── dist/            # Built frontend (generated)
├── server/              # Express backend
│   └── dist/            # Built backend (generated)
├── data/                # Runtime data
│   ├── dash.db          # SQLite database
│   ├── uploads/         # Uploaded files
│   └── backups/         # Local backups
└── scripts/             # Deployment scripts
```

## Nginx Reverse Proxy (Optional)

For production deployments, you can use nginx as a reverse proxy to serve Dash on port 80 with WebSocket support.

### Automated Setup

```bash
# Deploy with nginx reverse proxy
./scripts/deploy.sh --nginx

# With a custom domain
./scripts/deploy.sh --nginx --domain=dash.example.com
```

### Add Nginx to Existing Installation

If Dash is already running and you just want to add nginx:

```bash
# Add nginx reverse proxy without re-running full deployment
./scripts/deploy.sh --nginx-only

# With a custom domain
./scripts/deploy.sh --nginx-only --domain=dash.example.com
```

#### Re-running on a server that already has HTTPS

`--nginx` / `--nginx-only` install `nginx/dash.conf` as the `dash` site. If that site already exists and differs, a copy is kept at `/etc/nginx/sites-available/dash.bak.<timestamp>` (Fedora: `/etc/nginx/conf.d/dash.conf.bak.<timestamp>`). If the existing file contains certbot/SSL settings (`managed by Certbot` or `ssl_certificate`), the script **refuses to overwrite it** so your HTTPS configuration is not lost. To replace it anyway:

```bash
./scripts/deploy.sh --nginx-only --force-nginx --domain=dash.example.com
sudo certbot --nginx -d dash.example.com   # re-enable HTTPS afterwards
```

### Manual Setup

If you prefer to configure nginx manually:

```bash
# Install nginx
sudo apt install nginx        # Ubuntu/Debian
sudo dnf install nginx        # Fedora

# Copy the configuration
# Ubuntu/Debian:
sudo cp nginx/dash.conf /etc/nginx/sites-available/dash
sudo ln -sf /etc/nginx/sites-available/dash /etc/nginx/sites-enabled/dash
sudo rm -f /etc/nginx/sites-enabled/default

# Fedora:
sudo cp nginx/dash.conf /etc/nginx/conf.d/dash.conf

# Test and reload
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

### Enable HTTPS with Let's Encrypt

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx  # Ubuntu/Debian
sudo dnf install certbot python3-certbot-nginx  # Fedora

# Get certificate (replace with your domain)
sudo certbot --nginx -d dash.example.com

# Certificate auto-renews via systemd timer
sudo systemctl status certbot.timer
```

### Nginx Management

```bash
# Status
sudo systemctl status nginx

# Reload config (after changes)
sudo systemctl reload nginx

# View logs
tail -f /var/log/nginx/dash_access.log
tail -f /var/log/nginx/dash_error.log
```

### Nginx Configuration Files

| File | Purpose |
|------|---------|
| `nginx/dash.conf` | Main configuration (HTTP, port 80) |
| `nginx/dash-ssl.conf.example` | Template for manual HTTPS setup |

Both set `client_max_body_size 12M`: the app enforces its own 10 MB per-file upload limit and returns a JSON error the UI can show, so the nginx limit must stay a little above it (raise both together). The SSL template uses `http2 on;`, which needs nginx 1.25.1+; the file explains the `listen ... http2` alternative for older packages.

## Troubleshooting

### Service won't start
```bash
# Check logs
journalctl -u dash -n 100

# Check if port is in use
sudo lsof -i :3001

# Try running manually
cd /path/to/dash
node server/dist/index.js
```

### Database issues
```bash
# Reset database (WARNING: deletes all data). There are no Prisma migrations
# in this project; the schema is applied with `prisma db push`.
sudo systemctl stop dash
rm -f data/dash.db data/dash.db-journal     # production DB (DATABASE_URL in server/.env)
cd server
npx prisma db push
npx prisma db seed
sudo systemctl start dash
```

### Permission issues
```bash
# Fix ownership
sudo chown -R $USER:$USER /path/to/dash
```
