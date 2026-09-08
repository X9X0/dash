import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Login, Register, Dashboard, Machines, MachineDetail, MachineEdit, Calendar, Maintenance, MaintenanceDetail, Logs, Kiosk, Users, Notifications, MachineTypes, Settings } from './pages'
import { Layout } from './components/Layout'
import { useAuthStore } from './store/authStore'
import { authService } from './services/auth'
import { initSocket, disconnectSocket } from './services/socket'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return !isAuthenticated ? <>{children}</> : <Navigate to="/dashboard" replace />
}

function App() {
  const { isAuthenticated } = useAuthStore()

  // Validate a persisted session once on boot: refresh the cached user, and
  // end the session if the server rejects the token. A pure network failure
  // (no response) is not proof the token is bad, so the session is kept.
  useEffect(() => {
    const { token, setUser, logout } = useAuthStore.getState()
    if (!token) return
    authService
      .me()
      .then((user) => setUser(user))
      .catch((err: { response?: unknown }) => {
        if (err?.response) logout()
      })
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      initSocket()
    } else {
      disconnectSocket()
    }

    return () => {
      disconnectSocket()
    }
  }, [isAuthenticated])

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />
      <Route path="/" element={<Kiosk />} />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/machines"
        element={
          <PrivateRoute>
            <Layout>
              <Machines />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/machines/:id/edit"
        element={
          <PrivateRoute>
            <Layout>
              <MachineEdit />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/machines/:id"
        element={
          <PrivateRoute>
            <Layout>
              <MachineDetail />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <PrivateRoute>
            <Layout>
              <Calendar />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/maintenance"
        element={
          <PrivateRoute>
            <Layout>
              <Maintenance />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/maintenance/:id"
        element={
          <PrivateRoute>
            <Layout>
              <MaintenanceDetail />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/logs"
        element={
          <PrivateRoute>
            <Layout>
              <Logs />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/users"
        element={
          <PrivateRoute>
            <Layout>
              <Users />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/machine-types"
        element={
          <PrivateRoute>
            <Layout>
              <MachineTypes />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <PrivateRoute>
            <Layout>
              <Notifications />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <Layout>
              <Settings />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route path="/kiosk" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
