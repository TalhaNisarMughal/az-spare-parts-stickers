import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import Bills from './pages/Bills'
import Customers from './pages/Customers'
import Dashboard from './pages/Dashboard'
import Expenses from './pages/Expenses'
import Ledgers from './pages/Ledgers'
import Login from './pages/Login'
import Payables from './pages/Payables'
import Receivables from './pages/Receivables'
import SettingsPage from './pages/Settings'
import Store from './pages/Store'

function RequireAuth({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireAdmin({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/customers" replace />
  return children
}

function Home() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'admin' ? '/dashboard' : '/customers'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route
                path="/dashboard"
                element={
                  <RequireAdmin>
                    <Dashboard />
                  </RequireAdmin>
                }
              />
              <Route path="/customers" element={<Customers />} />
              <Route path="/store" element={<Store />} />
              <Route path="/bills" element={<Bills />} />
              <Route path="/ledgers" element={<Ledgers />} />
              <Route path="/receivables" element={<Receivables />} />
              <Route
                path="/payables"
                element={
                  <RequireAdmin>
                    <Payables />
                  </RequireAdmin>
                }
              />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="/expenses"
                element={
                  <RequireAdmin>
                    <Expenses />
                  </RequireAdmin>
                }
              />
            </Route>
            <Route path="/" element={<Home />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
