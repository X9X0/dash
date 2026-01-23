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
| `backup.sh` | Linux | Create timestamped backup of database and config |
| `restore.sh` | Linux | Restore from a backup file |
| `setup-backup.sh` | Linux | Configure automated daily backups |
| `backup.bat` | Windows | Windows backup script (batch) |
| `backup.ps1` | Windows | Windows backup script (PowerShell) |

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
- Install system dependencies
- Create data directories
- Generate `.env` files with secure defaults
- Install npm packages
- Setup database with Prisma
- Build client and server
- Create and start systemd service

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
- Pull latest changes
- Install any new dependencies
- Run database migrations
- Rebuild client and server
- Restart the service

## Backup & Restore

### Create a backup
```bash
./scripts/backup.sh
# Output: data/backups/dash_backup_20240123_120000.tar.gz
```

### Restore from backup
```bash
./scripts/restore.sh dash_backup_20240123_120000.tar.gz
```

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

# Check status
./scripts/setup-backup.sh --status

# Disable
./scripts/setup-backup.sh --disable
```

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
JWT_SECRET=your-secret-key
NODE_ENV=production
```

### Client (.env)
```env
VITE_API_URL=http://localhost:3001
```

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
# Reset database (WARNING: deletes all data)
cd server
rm prisma/dev.db
npx prisma migrate deploy
npx prisma db seed
```

### Permission issues
```bash
# Fix ownership
sudo chown -R $USER:$USER /path/to/dash
```
