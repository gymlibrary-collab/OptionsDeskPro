import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { Session, User } from '@supabase/supabase-js'
import api, { StaffMeResponse, getStaffMe } from '../api/client'

interface StaffAuthContextType {
  staffUser: User | null
  staffProfile: StaffMeResponse | null
  staffRole: 'owner' | 'support' | 'finance' | null
  loading: boolean
  error: string | null
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const StaffAuthContext = createContext<StaffAuthContextType>(null!)

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [staffUser, setStaffUser] = useState<User | null>(null)
  const [staffProfile, setStaffProfile] = useState<StaffMeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const initStaff = useCallback(async (sess: Session) => {
    api.defaults.headers.common['Authorization'] = `Bearer ${sess.access_token}`
    try {
      const profile = await getStaffMe()
      if (!profile.is_active) {
        throw new Error('You do not have admin portal access.')
      }
      setStaffProfile(profile)
      setError(null)
    } catch (e: unknown) {
      const err = e as { response?: { status?: number }; message?: string }
      const msg =
        err?.response?.status === 403
          ? 'You do not have admin portal access.'
          : err?.message || 'Authentication failed.'
      setError(msg)
      setStaffProfile(null)
      // Clear only the admin portal's auth header — do NOT call supabase.auth.signOut()
      // here because both portals share the same Supabase project and signing out would
      // invalidate the user's main client-portal session too.
      delete api.defaults.headers.common['Authorization']
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setStaffUser(s?.user ?? null)
      if (s) {
        initStaff(s)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setStaffUser(s?.user ?? null)
      if (s) {
        initStaff(s)
      } else {
        setStaffProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [initStaff])

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  const signInWithEmail = async (email: string, password: string) => {
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) throw err
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    delete api.defaults.headers.common['Authorization']
    setStaffProfile(null)
    setStaffUser(null)
  }

  const staffRole = staffProfile?.staff_role ?? null

  return (
    <StaffAuthContext.Provider
      value={{
        staffUser,
        staffProfile,
        staffRole,
        loading,
        error,
        signInWithGoogle,
        signInWithEmail,
        signOut,
      }}
    >
      {children}
    </StaffAuthContext.Provider>
  )
}

export const useStaffAuth = () => useContext(StaffAuthContext)
