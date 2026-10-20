import {
  Banknote,
  BookOpen,
  ChevronDown,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  Settings,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'

const ROLE_LABEL = { admin: 'Admin', user: 'Staff' }

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false) // off-canvas sidebar on small screens
  const [menuOpen, setMenuOpen] = useState(false) // profile dropdown
  const menuRef = useRef(null)

  // Close the drawer / menu whenever the route changes.
  useEffect(() => {
    setNavOpen(false)
    setMenuOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => menuRef.current && !menuRef.current.contains(e.target) && setMenuOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const admin = user?.role === 'admin'

  return (
    <div className="shell">
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}

      <aside className={`sidebar ${navOpen ? 'sidebar--open' : ''}`}>
        <div className="brand">
          <div className="brand-logo">
            <img src="/logo.png" alt="Mughal Sticker" />
          </div>
          <div className="brand-sub">Store &amp; Ledger System</div>
          <button className="icon-btn sidebar-close" onClick={() => setNavOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="nav">
          {admin && (
            <NavLink to="/dashboard" className="nav-link">
              <LayoutDashboard size={19} /> Dashboard
            </NavLink>
          )}
          <NavLink to="/customers" className="nav-link">
            <Users size={19} /> Customers
          </NavLink>
          <NavLink to="/store" className="nav-link">
            <Package size={19} /> Store
          </NavLink>
          <NavLink to="/bills" className="nav-link">
            <ReceiptText size={19} /> Bills &amp; Ledger
          </NavLink>
          <NavLink to="/ledgers" className="nav-link">
            <BookOpen size={19} /> Ledgers
          </NavLink>
          <NavLink to="/receivables" className="nav-link">
            <HandCoins size={19} /> Receivables
          </NavLink>
          {admin && (
            <NavLink to="/payables" className="nav-link">
              <Banknote size={19} /> Payables
            </NavLink>
          )}
          {admin && (
            <NavLink to="/expenses" className="nav-link">
              <Wallet size={19} /> Expenses
            </NavLink>
          )}
          <NavLink to="/settings" className="nav-link">
            <Settings size={19} /> Settings
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <button className="btn btn-ghost-dark" onClick={handleLogout}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn topbar-menu" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
          <img className="topbar-logo" src="/logo.png" alt="Mughal Sticker" />
          <div className="topbar-spacer" />
          <div className="profile-menu" ref={menuRef}>
            <button className="profile-chip" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen}>
              <Avatar user={user} size={40} />
              <span className="profile-meta">
                <span className="profile-name">{user?.full_name || user?.email}</span>
                <span className={`role-badge role-${user?.role}`}>{ROLE_LABEL[user?.role] || user?.role}</span>
              </span>
              <ChevronDown size={16} className="profile-caret" />
            </button>
            {menuOpen && (
              <div className="profile-dropdown" role="menu">
                <div className="profile-dropdown-head">
                  <strong>{user?.full_name || '—'}</strong>
                  <span className="td-muted">{user?.email}</span>
                </div>
                <button role="menuitem" onClick={() => navigate('/settings')}>
                  <Settings size={16} /> Settings &amp; profile
                </button>
                <button role="menuitem" onClick={handleLogout}>
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
