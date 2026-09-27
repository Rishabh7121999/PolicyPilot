import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  clearToken,
  getCurrentUser,
  getToken,
  login as apiLogin,
  logout as apiLogout,
  setToken,
  setUnauthorizedHandler,
  signup as apiSignup,
} from '../api/client'
import type { User } from '../api/types'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken()
      setUser(null)
    })

    const token = getToken()
    if (!token) {
      setIsLoading(false)
      return
    }

    getCurrentUser()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setIsLoading(false))

    return () => setUnauthorizedHandler(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login: async (email, password) => {
        const res = await apiLogin({ email, password })
        setToken(res.access_token)
        setUser(res.user)
      },
      signup: async (name, email, password) => {
        const res = await apiSignup({ name, email, password })
        setToken(res.access_token)
        setUser(res.user)
      },
      logout: () => {
        apiLogout()
        setUser(null)
      },
      refreshUser: async () => {
        setUser(await getCurrentUser())
      },
    }),
    [user, isLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
