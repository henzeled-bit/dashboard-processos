import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('dashboard_user')
    if (stored) {
      setUser(JSON.parse(stored))
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .single()

    if (error || !data) {
      return { error: 'Email ou senha incorretos' }
    }

    const userData = { id: data.id, email: data.email, name: data.name }
    setUser(userData)
    localStorage.setItem('dashboard_user', JSON.stringify(userData))
    return { user: userData }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('dashboard_user')
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
