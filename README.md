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
   # Copy example environment files
   cp server/.env.example server/.env
   cp client/.env.example client/.env
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

   The deployment script will:
   - Install Node.js 20 LTS (if needed)
   - Create data directories
   - Generate secure `.env` files
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
   copy client\.env.example client\.env
   ```
   Edit `server\.env` and set a secure `JWT_SECRET`.

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
./scripts/update.sh
```

This will pull latest changes, install dependencies, run migrations, rebuild, and restart the service.

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
- `data/uploads/` - Uploaded files
- `server/.env` and `client/.env` - Configuration files

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

**Manual backup:**
```cmd
mkdir backups
powershell Compress-Archive -Path server\prisma\dev.db,server\.env,client\.env -DestinationPath backups\manual_backup.zip
```

### Linux Backup

**Create a backup:**
```bash
./scripts/backup.sh
# Output: data/backups/dash_backup_20240123_120000.tar.gz
```

**Manual backup:**
```bash
mkdir -p data/backups
tar -czf data/backups/dash_backup_$(date +%Y%m%d_%H%M%S).tar.gz \
    data/dash.db \
    data/uploads \
    server/.env \
    client/.env
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

3. **Copy files to their locations**
   ```cmd
   copy restore_temp\dev.db server\prisma\dev.db
   copy restore_temp\.env server\.env
   ```

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

**Manual restore:**
```bash
# Stop the service
sudo systemctl stop dash

# Extract backup
tar -xzf data/backups/dash_backup_20240123_120000.tar.gz -C /

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
| `DATABASE_URL` | SQLite database path | `file:./prisma/dev.db` |
| `JWT_SECRET` | Secret key for JWT tokens | (generate secure random) |
| `NODE_ENV` | Environment mode | `development` |
| `SMTP_HOST` | Email server (optional) | - |
| `SMTP_PORT` | Email port (optional) | - |
| `SMTP_USER` | Email username (optional) | - |
| `SMTP_PASS` | Email password (optional) | - |
| `SLACK_WEBHOOK_URL` | Slack notifications (optional) | - |

### Client Environment Variables (`client/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:3001` |

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
# Reset database (WARNING: deletes all data)
cd server
rm prisma/dev.db
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
- **API client configuration:** See [server/.env.example](server/.env.example)
