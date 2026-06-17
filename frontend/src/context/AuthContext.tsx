import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Session, User } from '@supabase/supabase-js'
import api, { Entitlements, getEntitlements, postLogout } from '../api/client'

interface LoginResponse {
  ok: boolean
  email: string
  onboarding_completed: boolean
  onboarding_step: string
  is_deactivated: boolean
  pending_legal_acknowledgment?: boolean
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: LoginResponse | null
  isAdmin: boolean
  loading: boolean
  entitlements: Entitlements | null
  pendingLegalAcknowledgment: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshEntitlements: () => Promise<void>
  clearLegalAcknowledgmentPending: () => void
}

const AuthContext = createContext<AuthContextType>(null!)

const ADMIN_EMAIL = 'leonardsim.sm@gmail.com'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<LoginResponse | null>(null)
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingLegalAcknowledgment, setPendingLegalAcknowledgment] = useState(false)

  // Re-trigger the legal gate modal if any API call returns 451.
  // This handles the case where a new legal version is published while the
  // user is already logged in (login-time check would have returned false).
  useEffect(() => {
    const id = api.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err?.response?.status === 451) {
          setPendingLegalAcknowledgment(true)
        }
        return Promise.reject(err)
      }
    )
    return () => api.interceptors.response.eject(id)
  }, [])

  // Auto-refresh Supabase session on 401 ("Session does not exist" / expired token)
  // and retry the original request once with the new token.
  useEffect(() => {
    let isRefreshing = false
    const id = api.interceptors.response.use(
      (res) => res,
      async (err) => {
        if (err?.response?.status === 401 && !err.config?._retried) {
          if (!isRefreshing) {
            isRefreshing = true
            try {
              const { data } = await supabase.auth.refreshSession()
              if (data.session) {
                const token = data.session.access_token
                api.defaults.headers.common['Authorization'] = `Bearer ${token}`
                err.config._retried = true
                err.config.headers = { ...err.config.headers, Authorization: `Bearer ${token}` }
                isRefreshing = false
                return api.request(err.config)
              }
            } catch {
              // refresh failed — let the error propagate
            }
            isRefreshing = false
          }
        }
        return Promise.reject(err)
      }
    )
    return () => api.interceptors.response.eject(id)
  }, [])

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
      setPendingLegalAcknowledgment(data.pending_legal_acknowledgment === true)
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
    // Best-effort: log the logout event before invalidating the Supabase session.
    // If the backend call fails, proceed with sign-out regardless.
    try {
      await postLogout()
    } catch {
      // fire-and-forget; never block sign-out on logging failure
    }
    await supabase.auth.signOut()
    delete api.defaults.headers.common['Authorization']
    setProfile(null)
    setEntitlements(null)
    setPendingLegalAcknowledgment(false)
  }

  const clearLegalAcknowledgmentPending = useCallback(() => {
    setPendingLegalAcknowledgment(false)
  }, [])

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
        pendingLegalAcknowledgment,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        refreshEntitlements,
        clearLegalAcknowledgmentPending,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
