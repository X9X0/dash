import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Login, Register, Dashboard, Machines, MachineDetail, Calendar, Maintenance, Logs, Kiosk } from './pages'
import { Layout } from './components/Layout'
import { useAuthStore } from './store/authStore'
import { initSocket, disconnectSocket } from './services/socket'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return !isAuthenticated ? <>{children}</> : <Navigate to="/" />
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
      <Route
        path="/"
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
      <Route path="/kiosk" element={<Kiosk />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

export default App
