import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Session, User } from '@supabase/supabase-js'
import api from '../api/client'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: any | null
  isAdmin: boolean
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>(null!)

const ADMIN_EMAIL = 'leonardsim.sm@gmail.com'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session) {
        initUser(session)
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session) {
        initUser(session)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const initUser = async (session: Session) => {
    api.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`
    try {
      await api.post('/auth/login')
      const { data } = await api.get('/auth/me')
      setProfile(data)
    } catch (e: any) {
      if (e?.response?.status === 403) {
        await supabase.auth.signOut()
        alert(e.response?.data?.detail || 'Access denied. Contact the admin to request access.')
      }
    } finally {
      setLoading(false)
    }
  }

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    delete api.defaults.headers.common['Authorization']
    setProfile(null)
  }

  const isAdmin = user?.email === ADMIN_EMAIL || profile?.role === 'admin'

  return (
    <AuthContext.Provider
      value={{ user, session, profile, isAdmin, loading, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
