import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Login, Register, Dashboard, Machines, MachineDetail, MachineEdit, Calendar, Maintenance, Logs, Kiosk, Users, Notifications, MachineTypes, Settings } from './pages'
import { Layout } from './components/Layout'
import { useAuthStore } from './store/authStore'
import { initSocket, disconnectSocket } from './services/socket'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return !isAuthenticated ? <>{children}</> : <Navigate to="/dashboard" />
}

function App() {
  const { isAuthenticated } = useAuthStore()

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
      <Route path="/kiosk" element={<Navigate to="/" />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

export default App
