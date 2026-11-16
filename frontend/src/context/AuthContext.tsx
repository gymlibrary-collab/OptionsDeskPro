import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import api, { Entitlements, getEntitlements, postLogout, getSession, postEmailLogin, postSignUp, postResetRequest, SessionResponse } from '../api/client'

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
  /** Non-null when AuthContext has a one-time banner to surface on the login page
   *  (e.g. "Email verification failed or link expired."). Clear after displaying. */
  loginBanner: string | null
  clearLoginBanner: () => void
  signInWithGoogle: () => void
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
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
  // One-time banner to surface on the login page (e.g. email verify failure).
  const [loginBanner, setLoginBanner] = useState<string | null>(null)
  // Guard against concurrent fetchSession calls (e.g. focus event firing while
  // the initial mount call is still in flight after the OAuth redirect).
  const fetchSessionInFlight = useRef(false)
  // StrictMode guard: prevents the email-verification verifyOtp call from being
  // attempted twice (React 18 preserves refs across its simulated unmount/remount).
  const emailVerifyAttempted = useRef(false)

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

  // On mount: load session once, then re-check whenever the tab regains focus.
  useEffect(() => {
    (async () => {
      // After Google OAuth, the backend redirects to /#sb_access_token=...&sb_refresh_token=...
      // Hand the tokens to the Supabase JS client so it can manage auto-refresh from here on.
      const hash = window.location.hash
      if (hash && hash.includes('sb_access_token=')) {
        const params = new URLSearchParams(hash.substring(1))
        const at = params.get('sb_access_token')
        const rt = params.get('sb_refresh_token')
        if (at) {
          await supabase.auth.setSession({ access_token: at, refresh_token: rt ?? '' })
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
      }

      // Email-verification auto-login: Supabase redirects to /?token_hash=...&type=signup
      // (or type=email, depending on template wording).  Exchange the token, then run
      // _sync_profile via POST /api/auth/login before calling fetchSession so the
      // user_profiles row exists before we read the session.
      //
      // StrictMode guard: emailVerifyAttempted is a ref; React 18 preserves its value
      // across the simulated unmount/remount, so the second effect invocation is a no-op.
      if (!emailVerifyAttempted.current) {
        const qp = new URLSearchParams(window.location.search)
        const token_hash = qp.get('token_hash')
        const type = qp.get('type')
        if (token_hash && (type === 'signup' || type === 'email')) {
          emailVerifyAttempted.current = true
          // Clean URL immediately — a refresh or shared link must not retry a spent token.
          window.history.replaceState(null, '', window.location.pathname)
          try {
            const { error: verifyError } = await supabase.auth.verifyOtp({
              token_hash,
              type: type as 'signup' | 'email',
            })
            if (verifyError) {
              setLoginBanner('Email verification failed or link expired. Please try signing up again.')
            } else {
              // Run _sync_profile via the login endpoint to create user_profiles and
              // check the whitelist/invite-only gate before reading the session.
              try {
                await api.post('/auth/login', {})
              } catch (loginErr: unknown) {
                const le = loginErr as { response?: { status?: number; data?: { detail?: string } } }
                if (le?.response?.status === 403) {
                  // Invite-only or suspended — stay logged out, surface the message
                  setLoginBanner(le?.response?.data?.detail || 'Access denied. Contact support.')
                  await supabase.auth.signOut()
                  return
                }
                // Other errors: continue and let fetchSession determine the state
              }
              await fetchSession()
            }
          } catch {
            setLoginBanner('Email verification failed or link expired. Please try signing up again.')
          }
          return  // Skip the standard fetchSession below; we either signed in or set a banner
        }
      }

      await fetchSession()
    })()
    const handleFocus = () => fetchSession(true)
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchSession])

  // When Supabase silently signs the user out (refresh token expired after 60 days),
  // clear local state so the login page is shown.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        setEntitlements(null)
        setPendingLegalAcknowledgment(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = () => {
    const portalMode = (import.meta.env.VITE_PORTAL_MODE as string | undefined) || 'client'
    window.location.href = `${BACKEND_URL}/api/auth/google?portal=${portalMode}`
  }

  const signInWithEmail = async (email: string, password: string) => {
    const data = await postEmailLogin(email, password)
    if (data.access_token) {
      await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token ?? '' })
    }
    await fetchSession()
  }

  const signUpWithEmail = async (email: string, password: string) => {
    try {
      await postSignUp(email, password)
      // Success: LoginPage shows the neutral "check your email" confirmation.
      // No session is created here — the user must verify their email first.
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } }
      if (e?.response?.status === 403) {
        throw new Error('Password login is not available for this account. Use Google sign-in.')
      }
      if (e?.response?.status === 400) {
        const detail = e?.response?.data?.detail
        throw new Error(typeof detail === 'string' ? detail : 'Email and password are required.')
      }
      if (e?.response?.status === 503) {
        throw new Error('Authentication service unavailable. Please try again shortly.')
      }
      throw new Error('Sign-up failed. Please try again.')
    }
  }

  const requestPasswordReset = async (email: string) => {
    try {
      await postResetRequest(email)
      // Success: LoginPage shows the neutral "if an account exists…" confirmation.
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } }
      if (e?.response?.status === 403) {
        throw new Error('Password login is not available for this account. Use Google sign-in.')
      }
      if (e?.response?.status === 400) {
        throw new Error('Please enter your email address.')
      }
      if (e?.response?.status === 503) {
        throw new Error('Authentication service unavailable. Please try again shortly.')
      }
      throw new Error('Request failed. Please try again.')
    }
  }

  const signOut = async () => {
    try {
      await postLogout()
    } catch {
      // fire-and-forget; never block sign-out on a logging failure
    }
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setEntitlements(null)
    setPendingLegalAcknowledgment(false)
  }

  const clearLegalAcknowledgmentPending = useCallback(() => {
    setPendingLegalAcknowledgment(false)
  }, [])

  const clearLoginBanner = useCallback(() => {
    setLoginBanner(null)
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
        loginBanner,
        clearLoginBanner,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        requestPasswordReset,
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
