import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Calendar,
  Cpu,
  ClipboardList,
  Wrench,
  Bell,
  Users,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  Settings,
  Monitor,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './common'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useThemeStore, applyTheme } from '@/store/themeStore'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  roles?: string[]
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: 'Calendar', href: '/calendar', icon: <Calendar className="h-5 w-5" /> },
  { label: 'Machines', href: '/machines', icon: <Cpu className="h-5 w-5" /> },
  { label: 'Jobs & Logs', href: '/logs', icon: <ClipboardList className="h-5 w-5" /> },
  { label: 'Maintenance', href: '/maintenance', icon: <Wrench className="h-5 w-5" /> },
  { label: 'Users', href: '/users', icon: <Users className="h-5 w-5" />, roles: ['admin'] },
  { label: 'Machine Types', href: '/machine-types', icon: <Cpu className="h-5 w-5" />, roles: ['admin'] },
]

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { unreadCount } = useNotificationStore()
  const { theme, setTheme } = useThemeStore()

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const filteredNavItems = navItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <span className="font-semibold">Dash</span>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-30 w-64 transform border-r bg-background transition-transform duration-200 ease-in-out lg:static lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex h-14 items-center border-b px-6">
            <Link to="/dashboard" className="flex items-center gap-2 font-semibold">
              <Cpu className="h-6 w-6 text-primary" />
              <span>Dash</span>
            </Link>
          </div>

          <nav className="flex flex-col gap-1 p-4 pb-36 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
            {filteredNavItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  location.pathname === item.href
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 border-t p-4 bg-background">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-medium text-primary">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={() => navigate('/notifications')}
                title="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/settings')}
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/')}
                title="Kiosk Mode"
              >
                <Monitor className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </aside>

        {/* Backdrop for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
