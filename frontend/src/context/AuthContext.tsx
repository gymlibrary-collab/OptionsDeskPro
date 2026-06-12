import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Session, User } from '@supabase/supabase-js'
import api, { Entitlements, getEntitlements } from '../api/client'

interface LoginResponse {
  ok: boolean
  email: string
  onboarding_completed: boolean
  onboarding_step: string
  is_deactivated: boolean
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: LoginResponse | null
  isAdmin: boolean
  loading: boolean
  entitlements: Entitlements | null
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshEntitlements: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>(null!)

const ADMIN_EMAIL = 'leonardsim.sm@gmail.com'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<LoginResponse | null>(null)
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchEntitlements = useCallback(async () => {
    try {
      const data = await getEntitlements()
      setEntitlements(data)
    } catch {
      // on error keep previous entitlements or null — UI falls back to free
    }
  }, [])

  const initUser = useCallback(async (sess: Session) => {
    api.defaults.headers.common['Authorization'] = `Bearer ${sess.access_token}`
    try {
      const { data } = await api.post<LoginResponse>('/auth/login')
      setProfile(data)
      if (data.is_deactivated) {
        await supabase.auth.signOut()
        delete api.defaults.headers.common['Authorization']
        setProfile(null)
        alert('Your account has been suspended. Please contact support.')
        return
      }
      await fetchEntitlements()
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { detail?: string } } }
      if (err?.response?.status === 403) {
        await supabase.auth.signOut()
        delete api.defaults.headers.common['Authorization']
        alert(err.response?.data?.detail || 'Access denied. Contact support.')
      }
    } finally {
      setLoading(false)
    }
  }, [fetchEntitlements])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s) {
        initUser(s)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s) {
        initUser(s)
      } else {
        setProfile(null)
        setEntitlements(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [initUser])

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signUpWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    delete api.defaults.headers.common['Authorization']
    setProfile(null)
    setEntitlements(null)
  }

  const refreshEntitlements = useCallback(async () => {
    await fetchEntitlements()
  }, [fetchEntitlements])

  const isAdmin = user?.email === ADMIN_EMAIL || (profile as unknown as { role?: string })?.role === 'admin'

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isAdmin,
        loading,
        entitlements,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        refreshEntitlements,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
