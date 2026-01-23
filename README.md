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
