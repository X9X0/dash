# Dash - Robot & 3D Printer Dashboard

A modular web dashboard for managing robots and 3D printers with reservation, tracking, logging, and real-time monitoring capabilities.

## Quick Start

### Prerequisites
- Node.js 20+
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Initialize the database:
```bash
npm run db:push
npm run db:seed
```

3. Start the development servers:
```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Default Login
- Email: admin@example.com
- Password: admin123

Change this password after first login. New users who register themselves get the read-only `viewer` role; promote them on the Users page (see `REGISTRATION_ROLE` / `ALLOW_REGISTRATION` in the configuration reference).

## Project Structure

```
dash/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/        # UI components
│   │   ├── pages/             # Page components
│   │   ├── services/          # API client
│   │   ├── store/             # Zustand state
│   │   └── types/             # TypeScript types
├── server/                    # Node.js backend
│   ├── src/
│   │   ├── routes/            # API endpoints
│   │   ├── middleware/        # Auth middleware
│   │   └── socket/            # WebSocket handlers
│   └── prisma/
│       └── schema.prisma      # Database schema
```

## Features

- **Dashboard**: Real-time machine status overview
- **Calendar**: Reservation scheduling system
- **Machines**: Add, edit, and monitor equipment
- **Jobs & Logs**: Track job history and activity
- **Maintenance**: Submit and manage repair requests
- **Real-time**: WebSocket updates for live status changes

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **Database**: SQLite with Prisma ORM
- **Real-time**: Socket.io
- **Auth**: JWT with bcrypt

## Available Scripts

- `npm run dev` - Start both frontend and backend in development mode
- `npm run build` - Build for production
- `npm run db:push` - Push schema changes to database
- `npm run db:seed` - Seed database with sample data
- `npm run db:studio` - Open Prisma Studio

## API Endpoints

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/machines` - List machines
- `POST /api/machines` - Create machine
- `GET /api/reservations` - List reservations
- `POST /api/reservations` - Create reservation
- `GET /api/maintenance` - List maintenance requests
- `POST /api/maintenance` - Submit maintenance request

---

## Installation & Deployment

### Development Setup

#### Prerequisites
- Node.js 20 or higher
- npm (comes with Node.js)
- Git

#### Steps

1. **Clone the repository**
   ```bash
   git clone <your-repo-url> dash
   cd dash
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment files**
   ```bash
   # Copy the example server environment file (the client needs no .env;
   # it uses relative URLs and reads no VITE_* variables)
   cp server/.env.example server/.env
   ```

4. **Initialize the database**
   ```bash
   npm run db:push
   npm run db:seed
   ```

5. **Start development servers**
   ```bash
   npm run dev
   ```

6. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001
   - Default login: `admin@example.com` / `admin123`

### Production Deployment (Linux)

For production deployment on Linux servers, use the automated deployment script:

1. **Clone and deploy**
   ```bash
   git clone <your-repo-url> dash
   cd dash
   chmod +x scripts/*.sh
   ./scripts/deploy.sh
   ```

   Run the script as the (unprivileged) user that should own the checkout and run the service — **not** as `sudo ./scripts/deploy.sh`. It calls `sudo` itself for the few system-level steps (package installs, the systemd unit, nginx); running the whole script as root would make the service and files root-owned.

   The deployment script will:
   - Install Node.js 20 LTS (if needed)
   - Install `libnss-resolve` and enable LLMNR in systemd-resolved (adds the `resolve` module to the `hosts:` line of `/etc/nsswitch.conf`) for local hostname lookups
   - Create data directories
   - Generate a secure `server/.env`
   - Install dependencies
   - Build client and server
   - Create and start systemd service

2. **Access the application**
   ```
   http://your-server-ip:3001
   ```

3. **Manage the service**
   ```bash
   sudo systemctl start dash      # Start
   sudo systemctl stop dash       # Stop
   sudo systemctl restart dash    # Restart
   sudo systemctl status dash     # View status
   journalctl -u dash -f          # View logs
   ```

### Production Deployment (Windows)

1. **Clone the repository**
   ```cmd
   git clone <your-repo-url> dash
   cd dash
   ```

2. **Install dependencies**
   ```cmd
   npm install
   ```

3. **Configure environment**
   ```cmd
   copy server\.env.example server\.env
   ```
   Edit `server\.env` and set a secure `JWT_SECRET` (the client needs no `.env`).

4. **Initialize database**
   ```cmd
   npm run db:push
   npm run db:seed
   ```

5. **Build for production**
   ```cmd
   npm run build
   ```

6. **Run the server**
   ```cmd
   cd server
   node dist/index.js
   ```

   For running as a Windows service, consider using [PM2](https://pm2.keymetrics.io/) or [NSSM](https://nssm.cc/).

### Updating an Existing Installation

#### Linux
```bash
./scripts/update.sh [OPTIONS]
```

**Options:**
- `--reset` - Fetch from origin, then hard-reset the working tree to `origin/<branch>` (discarding local changes and commits; recommended for production servers)
- `--stash` - Automatically stash changes without prompting
- `--branch <name>` - Check out and update the given branch
- `--help` - Show help message

**Examples:**
```bash
# Interactive mode (prompts if there are local changes)
./scripts/update.sh

# Production mode (discards any local modifications)
./scripts/update.sh --reset

# Auto-stash mode (preserves changes, restores after update)
./scripts/update.sh --stash
```

This will pull latest changes, install dependencies, apply schema changes (`prisma db push`), rebuild, and restart the service. It also installs the mDNS/NetBIOS name-resolution packages (`avahi-daemon`, `libnss-mdns`, `winbind`) if they are missing and adds them to `/etc/nsswitch.conf`.

#### Windows / Manual Update
```bash
git pull
npm install
npm run db:push
npm run build
# Restart the server
```

---

## Backup

Regular backups protect your data. Backups include the SQLite database, uploaded files, and configuration.

### What Gets Backed Up
- `data/dash.db` or `server/prisma/dev.db` - SQLite database
- `data/uploads/` (and legacy `server/uploads/` on Windows) - Uploaded files
- `server/.env` - Configuration (contains secrets; the archives are created with mode `600` on Linux — store them securely)

The archive layout is `dash_backup_<timestamp>/` containing `dash.db`, `uploads/`, `config/server.env` and `backup_info.json` (a `.tar.gz` on Linux, a `.zip` on Windows). `restore.sh` accepts either format.

### Windows Backup

**Using the batch script:**
```cmd
scripts\backup.bat
```

**Using PowerShell:**
```powershell
.\scripts\backup.ps1
```

Backups are saved to the `backups/` folder with timestamp: `dash_backup_YYYYMMDD_HHMMSS.zip`

**Manual backup** (stop the server first so the database copy is consistent):
```cmd
mkdir backups
powershell Compress-Archive -Path server\prisma\dev.db,data\uploads,server\.env -DestinationPath backups\manual_backup.zip
```

### Linux Backup

**Create a backup:**
```bash
./scripts/backup.sh
# Output: data/backups/dash_backup_20240123_120000.tar.gz
```

**Manual backup** (stop the service first, or use `sqlite3 data/dash.db ".backup snapshot.db"` for a consistent copy of a live database):
```bash
mkdir -p data/backups
tar -czf data/backups/dash_backup_$(date +%Y%m%d_%H%M%S).tar.gz \
    data/dash.db \
    data/uploads \
    server/.env
```

### Automated Daily Backups (Linux)

```bash
# Enable daily backups at 2 AM
./scripts/setup-backup.sh --daily

# With SSH transfer to remote server
./scripts/setup-backup.sh --daily --ssh user@backup-server:/backups/dash

# Check status
./scripts/setup-backup.sh --status

# Disable automated backups
./scripts/setup-backup.sh --disable
```

### Transferring Backups

```bash
# Linux to Linux (SCP)
scp data/backups/dash_backup_*.tar.gz user@newmachine:/path/to/dash/

# Windows to Linux (using PowerShell with SSH)
scp backups\dash_backup_*.zip user@linux-server:/path/to/dash/backups/
```

---

## Restore

### Windows Restore

1. **Stop the server** if running

2. **Extract the backup**
   ```powershell
   Expand-Archive -Path backups\dash_backup_YYYYMMDD_HHMMSS.zip -DestinationPath restore_temp
   ```
   The zip contains a `dash_backup_YYYYMMDD_HHMMSS\` folder with `dash.db`, `uploads\` and `config\server.env`.

3. **Copy files to their locations** (delete any stale `dev.db-journal` / `dev.db-wal` / `dev.db-shm` next to the database first)
   ```cmd
   copy restore_temp\dash_backup_YYYYMMDD_HHMMSS\dash.db server\prisma\dev.db
   xcopy restore_temp\dash_backup_YYYYMMDD_HHMMSS\uploads data\uploads /E /I /Y
   copy restore_temp\dash_backup_YYYYMMDD_HHMMSS\config\server.env server\.env
   ```
   Use `data\dash.db` instead of `server\prisma\dev.db` if your `DATABASE_URL` points there.

4. **Restart the server**
   ```cmd
   cd server
   node dist/index.js
   ```

### Linux Restore

**Using the restore script:**
```bash
./scripts/restore.sh data/backups/dash_backup_20240123_120000.tar.gz
```

**Restore without overwriting config:**
```bash
./scripts/restore.sh data/backups/dash_backup_20240123_120000.tar.gz --no-config
```

**Manual restore** (prefer `restore.sh`, which does all of this for you):
```bash
# Stop the service
sudo systemctl stop dash

# Extract to a temp dir — the archive root is dash_backup_<timestamp>/, so
# never extract it to / directly
tmp=$(mktemp -d)
tar -xzf data/backups/dash_backup_20240123_120000.tar.gz -C "$tmp"
src="$tmp"/dash_backup_*

# Remove stale SQLite sidecars, then copy the database and the uploads CONTENTS
rm -f data/dash.db-journal data/dash.db-wal data/dash.db-shm
cp "$src"/dash.db data/dash.db
mkdir -p data/uploads
cp -r "$src"/uploads/. data/uploads/
# optional: cp "$src"/config/server.env server/.env
rm -rf "$tmp"

# Restart service
sudo systemctl start dash
```

### Migrating to a New Server

1. **On the source machine:** Create a fresh backup
   ```bash
   ./scripts/backup.sh
   ```

2. **Transfer the backup** to the new server
   ```bash
   scp data/backups/dash_backup_*.tar.gz user@newserver:/tmp/
   ```

3. **On the new server:** Deploy and restore
   ```bash
   # Clone and deploy
   git clone <your-repo-url> dash
   cd dash
   chmod +x scripts/*.sh
   ./scripts/deploy.sh

   # Stop service and restore data
   sudo systemctl stop dash
   ./scripts/restore.sh /tmp/dash_backup_*.tar.gz
   sudo systemctl start dash
   ```

---

## Configuration Reference

### Server Environment Variables (`server/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `DATABASE_URL` | SQLite database path. Relative paths resolve against `server/prisma/`, so the default is `server/prisma/dev.db`; production uses an absolute path such as `file:/home/scap/dash/data/dash.db` | `file:./dev.db` |
| `JWT_SECRET` | Secret key for JWT tokens. Required in production; the server refuses to start with the placeholder value | (generate with `openssl rand -base64 32`) |
| `NODE_ENV` | Environment mode (`deploy.sh` sets `production`) | `development` |
| `DASH_DATA_DIR` | Data directory. Uploads are stored in `DASH_DATA_DIR/uploads`, which is what the backup scripts archive | `./data` (set by deploy/update scripts) |
| `UPLOADS_DIR` | Override the uploads directory | `DASH_DATA_DIR/uploads` |
| `CLIENT_URL` | Origin allowed for Socket.io CORS. Only needed when the client is served from a different origin than the API (e.g. the Vite dev server); behind nginx or the built-in static serving it is same-origin | `http://localhost:5173` |
| `TRUST_PROXY` | Express `trust proxy` setting, used to read the real client IP from `X-Forwarded-For`. The default trusts the local nginx; set e.g. `1` or a CIDR when a remote load balancer sits in front | `loopback` |
| `REGISTRATION_ROLE` | Role given to self-registered users (`viewer` or `operator`). The first user is always `admin` | `viewer` |
| `ALLOW_REGISTRATION` | Set to `false` to disable self sign-up (admins create accounts instead) | `true` |
| `SMTP_HOST` | Email server (optional) | - |
| `SMTP_PORT` | Email port (optional) | - |
| `SMTP_USER` | Email username (optional) | - |
| `SMTP_PASS` | Email password (optional) | - |
| `SMTP_REQUIRE_TLS` | Set to `true` to refuse sending unless the SMTP server offers STARTTLS | `false` |
| `SLACK_WEBHOOK_URL` | Slack notifications (optional) | - |

### Client Environment Variables

None. The client uses relative URLs (`/api/...`, Socket.io on `/`) and reads no `VITE_*` variables, so it needs no `client/.env`. In development Vite proxies API and socket requests to the server on port 3001; in production the Express server serves the built client and the API from the same origin (optionally behind nginx).

---

## Troubleshooting

### Service won't start (Linux)
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
sudo systemctl stop dash                       # production only
rm -f data/dash.db data/dash.db-journal        # production: data/dash.db
                                               # development: server/prisma/dev.db
cd server
npx prisma db push
npx prisma db seed
```

### Permission issues (Linux)
```bash
sudo chown -R $USER:$USER /path/to/dash
```

### Port already in use
```bash
# Find process using port
# Linux:
lsof -i :3001
# Windows:
netstat -ano | findstr :3001

# Kill process (Linux)
kill -9 <PID>
# Kill process (Windows)
taskkill /PID <PID> /F
```

---

## Additional Resources

- **Detailed deployment scripts documentation:** See [scripts/README.md](scripts/README.md)
- **Database schema:** See [server/prisma/schema.prisma](server/prisma/schema.prisma)
- **Server configuration reference:** See [server/.env.example](server/.env.example)
