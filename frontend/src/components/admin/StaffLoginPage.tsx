import { useState } from 'react'
import { useStaffAuth } from '../../context/StaffAuthContext'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
  input: '#252836',
  error: '#ef4444',
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

export default function StaffLoginPage() {
  const { signInWithGoogle, signInWithEmail, error: authError } = useStaffAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!email.trim() || !password) { setFormError('Email and password are required.'); return }
    setSubmitting(true)
    try {
      await signInWithEmail(email.trim(), password)
    } catch (e: unknown) {
      const err = e as { message?: string }
      setFormError(err?.message || 'Authentication failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const displayError = formError || authError

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg, padding: '20px', fontFamily: FONT }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '48px 40px', width: '100%', maxWidth: '400px', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <span style={{ fontSize: '32px', color: C.accent }}>⬡</span>
          <h1 style={{ margin: '8px 0 4px', fontSize: '22px', fontWeight: 700, color: C.text }}>Admin Portal</h1>
          <p style={{ margin: 0, fontSize: '13px', color: C.muted }}>OptionsDesk platform staff access</p>
        </div>

        <button
          onClick={signInWithGoogle}
          disabled={submitting}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '11px', background: '#fff', color: '#1a1d27', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', marginBottom: '16px', fontFamily: FONT }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" style={{ marginRight: '10px', flexShrink: 0 }}>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          Sign in with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{ flex: 1, height: '1px', background: C.border }} />
          <span style={{ fontSize: '12px', color: C.muted }}>or</span>
          <div style={{ flex: 1, height: '1px', background: C.border }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input
            type="email"
            placeholder="Staff email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={submitting}
            style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: '8px', color: C.text, padding: '10px 12px', fontSize: '14px', fontFamily: FONT, outline: 'none' }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={submitting}
            style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: '8px', color: C.text, padding: '10px 12px', fontSize: '14px', fontFamily: FONT, outline: 'none' }}
          />
          {displayError && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.error}`, borderRadius: '8px', padding: '10px', fontSize: '13px', color: C.error }}>
              {displayError}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            style={{ background: C.accent, border: 'none', borderRadius: '8px', color: '#fff', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1, fontFamily: FONT }}
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={{ margin: '20px 0 0', fontSize: '12px', color: '#475569', textAlign: 'center' }}>
          Platform staff access only. Subscriber accounts are not permitted.
        </p>
      </div>
    </div>
  )
}
