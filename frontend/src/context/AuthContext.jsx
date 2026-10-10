import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ms_user')) || null
    } catch {
      return null
    }
  })

  const persist = (u) => {
    localStorage.setItem('ms_user', JSON.stringify(u))
    setUser(u)
  }

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('ms_token', data.access_token)
    persist(data.user)
    return data.user
  }

  const logout = () => {
    localStorage.removeItem('ms_token')
    localStorage.removeItem('ms_user')
    setUser(null)
  }

  /** Re-read the profile from the server (name, email, role, picture). */
  const refreshUser = useCallback(async () => {
    const { data } = await api.get('/auth/me')
    persist(data)
    return data
  }, [])

  // Sessions from before the profile feature lack an id — refresh them once.
  useEffect(() => {
    if (user && user.id == null) refreshUser().catch(() => {})
  }, []) // eslint-disable-line

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, setUser: persist }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
