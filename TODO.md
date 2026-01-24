# Dash - TODO List

## Critical Gaps (Backend API exists, Frontend UI missing)

### High Priority

- [ ] **User Management Page** (`/users`)
  - Backend: Full CRUD in `/api/users` (admin only)
  - Navigation item exists in Layout.tsx but page doesn't exist
  - Features needed: List users, edit roles, delete users, create users

- [ ] **Notifications Page** (`/notifications`)
  - Backend: Full API in `/api/notifications`
  - Bell icon in header shows unread count but links nowhere
  - Features needed: List notifications, mark as read, delete

- [ ] **Machine Edit Page** (`/machines/:id/edit`)
  - Backend: PATCH `/api/machines/:id` exists
  - Edit button on MachineDetail navigates to non-existent page
  - Features needed: Form to edit machine details, location, notes, etc.

### Medium Priority

- [ ] **Hour Logging UI**
  - Backend: POST `/api/machines/:id/hours` exists
  - MachineDetail shows hourMeter but no way to log hours
  - Features needed: Dialog/form to log hours, view hour history

- [ ] **Auto Hour Tracking (Network-Based)**
  - Add slider/toggle in machine settings to enable auto hour tracking
  - When enabled, automatically increment hours based on time machine is visible on network (ping reachable)
  - Requires: Background job/cron to periodically ping and update hours
  - Settings: Enable/disable per machine, update interval

- [ ] **Service Records - Full CRUD**
  - Backend: Full CRUD exists in `/api/service-records` and `/api/machines/:id/service-history`
  - Currently read-only display (last 5 records on MachineDetail)
  - Features needed: Add service record dialog, edit, delete, view all records, photo display

- [ ] **Job Management**
  - Backend: Full CRUD in `/api/jobs`
  - Currently view-only table in Logs page
  - Features needed: Create job, edit job status, delete job, job detail view

### Low Priority

- [ ] **Machine Types Admin Panel**
  - Backend: Full CRUD in `/api/machine-types` (admin only)
  - Currently no UI to manage machine types
  - Features needed: List types, create new types, edit, delete, manage custom field schemas

- [ ] **Machine Custom Fields UI**
  - Backend: MachineCustomField model exists
  - No UI to add/edit custom fields on machines
  - Features needed: Dynamic form based on type's fieldsSchema

- [ ] **Settings Page**
  - No user settings/preferences page
  - Features needed: Update profile, change password, notification preferences

---

## Completed Features

- [x] Dashboard with real-time machine status
- [x] Calendar reservation system
- [x] Machine list and detail view
- [x] Machine IP management (add/delete IPs)
- [x] Machine ping functionality (individual and batch)
- [x] Maintenance request system
- [x] Activity logs viewing
- [x] Kiosk mode for public displays
- [x] Authentication (login/register)
- [x] Role-based access (admin/operator/viewer)
- [x] Real-time updates via WebSocket

---

## Infrastructure / DevOps

- [x] Production deployment script (Linux)
- [x] Backup scripts (Windows & Linux)
- [x] Restore script (supports both .tar.gz and .zip)
- [x] Automated daily backup setup
- [x] Systemd service configuration
- [x] Documentation (README with install/backup/restore)

---

## Notes

- All backend APIs are implemented and functional
- Most features just need frontend UI components
- Database schema is complete for all planned features
