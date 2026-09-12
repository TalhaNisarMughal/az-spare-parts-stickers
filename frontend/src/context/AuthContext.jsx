import { createContext, useContext, useState } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('az_user')) || null
    } catch {
      return null
    }
  })

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('az_token', data.access_token)
    localStorage.setItem('az_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }

  const logout = () => {
    localStorage.removeItem('az_token')
    localStorage.removeItem('az_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
