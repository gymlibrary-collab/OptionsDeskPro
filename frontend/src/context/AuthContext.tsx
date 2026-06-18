import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import api, { Entitlements, getEntitlements, postLogout, getSession, postEmailLogin, SessionResponse, setLocalTokens, clearLocalTokens } from '../api/client'

const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  'https://optionscompass-backend.up.railway.app'

// Local user type — replaces supabase-js User; only fields actually consumed by the UI
interface SessionUser {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  // SettingsPage reads user?.app_metadata?.provider — provide a stub so it doesn't error
  app_metadata?: { provider?: string }
}

interface AuthContextType {
  user: SessionUser | null
  session: null
  profile: SessionResponse | null
  isAdmin: boolean
  loading: boolean
  entitlements: Entitlements | null
  pendingLegalAcknowledgment: boolean
  signInWithGoogle: () => void
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshEntitlements: () => Promise<void>
  clearLegalAcknowledgmentPending: () => void
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [profile, setProfile] = useState<SessionResponse | null>(null)
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingLegalAcknowledgment, setPendingLegalAcknowledgment] = useState(false)
  // Guard against concurrent fetchSession calls (e.g. focus event firing while
  // the initial mount call is still in flight after the OAuth redirect).
  const fetchSessionInFlight = useRef(false)

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

  const fetchEntitlements = useCallback(async () => {
    try {
      const data = await getEntitlements()
      setEntitlements(data)
    } catch {
      // on error keep previous entitlements or null — UI falls back to free
    }
  }, [])

  const fetchSession = useCallback(async (silent = false) => {
    if (fetchSessionInFlight.current) return
    fetchSessionInFlight.current = true
    if (!silent) setLoading(true)
    try {
      const data = await getSession()
      setUser({
        id: data.user_id,
        email: data.email,
        full_name: data.full_name,
        avatar_url: data.avatar_url,
      })
      setProfile(data)
      setPendingLegalAcknowledgment(data.pending_legal_acknowledgment)
      await fetchEntitlements()
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } }
      if (e?.response?.status === 401) {
        setUser(null)
        setProfile(null)
        setEntitlements(null)
      } else if (e?.response?.status === 403) {
        setUser(null)
        setProfile(null)
        setEntitlements(null)
        // Account suspended — surface to user
        const detail = e?.response?.data?.detail
        if (detail) alert(detail)
      }
      // other errors: keep existing state to avoid flicker on transient network issues
    } finally {
      if (!silent) setLoading(false)
      fetchSessionInFlight.current = false
    }
  }, [fetchEntitlements])

  // On mount: load session once, then re-check whenever the tab regains focus
  // (handles the case where the user signs in via the backend OAuth redirect in another tab).
  useEffect(() => {
    // After Google OAuth, the backend redirects to /#sb_access_token=...&sb_refresh_token=...
    // Extract the tokens, store in localStorage for Bearer-header auth, and clean the URL.
    const hash = window.location.hash
    if (hash && hash.includes('sb_access_token=')) {
      const params = new URLSearchParams(hash.substring(1))
      const at = params.get('sb_access_token')
      const rt = params.get('sb_refresh_token')
      if (at) {
        setLocalTokens(at, rt ?? '')
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
    fetchSession()
    const handleFocus = () => fetchSession(true)
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchSession])

  const signInWithGoogle = () => {
    window.location.href = `${BACKEND_URL}/api/auth/google`
  }

  const signInWithEmail = async (email: string, password: string) => {
    const data = await postEmailLogin(email, password)
    if (data.access_token) {
      setLocalTokens(data.access_token, data.refresh_token ?? '')
    }
    await fetchSession()
  }

  const signUpWithEmail = async (_email: string, _password: string) => {
    // Email/password sign-up is not yet supported in the backend-auth-proxy flow.
    // LoginPage currently calls this only on 'signup' mode; throw a user-facing error.
    throw new Error('Account creation is not yet available. Please use Google sign-in.')
  }

  const signOut = async () => {
    try {
      await postLogout()
    } catch {
      // fire-and-forget; never block sign-out on a logging failure
    }
    clearLocalTokens()
    setUser(null)
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

  const isAdmin = profile?.is_admin === true

  return (
    <AuthContext.Provider
      value={{
        user,
        session: null,
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
