/**
 * ResetPasswordPage — landing page for Supabase password-reset email links.
 *
 * URL shape expected: /reset-password?token_hash=<hash>&type=recovery
 *
 * Flow:
 *  1. Mount: read token_hash + type from URL, clean URL with replaceState.
 *  2. If type !== 'recovery' or token_hash missing → show "invalid link" error.
 *  3. Call supabase.auth.verifyOtp({ token_hash, type: 'recovery' }).
 *  4. On error → show "expired/already used" message with link to /?forgot=1.
 *  5. On success → show set-new-password form.
 *  6. On form submit → validate → call POST /api/auth/update-password.
 *  7. On success → redirect to /?reset_success=1 (LoginPage shows banner).
 *
 * StrictMode guard: verifyAttempted ref is preserved across React 18's simulated
 * unmount/remount so the one-time token is not submitted twice.
 */
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { updatePassword } from '../api/client'

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif"

const C = {
  bg: '#08090f',
  surface: '#0d0f1a',
  border: '#1e2235',
  text: '#e2e8f0',
  muted: '#4b5563',
  accent: '#7c6af7',
  error: '#ef4444',
  success: '#22c55e',
}

export default function ResetPasswordPage() {
  // StrictMode guard: React 18 preserves refs across its simulated double-invoke,
  // so setting this to true in the first effect prevents the second from re-running.
  const verifyAttempted = useRef(false)

  const [verifying, setVerifying] = useState(true)
  const [verifyError, setVerifyError] = useState(false)
  const [invalidLink, setInvalidLink] = useState(false)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (verifyAttempted.current) return
    verifyAttempted.current = true

    const params = new URLSearchParams(window.location.search)
    const token_hash = params.get('token_hash')
    const type = params.get('type')

    // Clean URL immediately — a refresh or shared link must not retry a spent token.
    window.history.replaceState(null, '', window.location.pathname)

    if (!token_hash || type !== 'recovery') {
      setInvalidLink(true)
      setVerifying(false)
      return
    }

    supabase.auth.verifyOtp({ token_hash, type: 'recovery' }).then(({ error }) => {
      setVerifying(false)
      if (error) {
        setVerifyError(true)
      }
      // On success: Supabase JS client now holds a recovery session in memory.
      // The Bearer-header interceptor in client.ts will attach it when update-password
      // is called.  fetchSession is NOT called — the user is not being logged in here.
    })
  }, [])

  // Redirect on success
  useEffect(() => {
    if (done) {
      window.location.href = '/?reset_success=1'
    }
  }, [done])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (password.length < 12) { setFormError('Password must be at least 12 characters.'); return }
    if (password !== confirmPassword) { setFormError('Passwords do not match.'); return }
    setSubmitting(true)
    try {
      await updatePassword(password)
      // End the recovery session so the user signs in with the new password
      // rather than staying logged in on a link-derived token.
      try { await supabase.auth.signOut() } catch { /* redirect regardless */ }
      setDone(true)
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } }; message?: string }
      if (e?.response?.status === 503) {
        setFormError('Authentication service unavailable. Please try again shortly.')
      } else {
        setFormError(e?.response?.data?.detail || 'Failed to update password. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: C.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: FONT,
    color: C.text,
    padding: '24px',
  }

  const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '400px',
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: '16px',
    padding: '36px 32px',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px 12px 40px',
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: '10px',
    color: C.text,
    fontSize: '14px',
    fontFamily: FONT,
    outline: 'none',
    boxSizing: 'border-box',
  }

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '13px',
    background: C.accent,
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: FONT,
    opacity: disabled ? 0.7 : 1,
    boxShadow: '0 4px 20px rgba(124,106,247,0.35)',
    marginTop: '20px',
  })

  if (verifying) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', color: C.muted, fontSize: '15px' }}>
            Verifying reset link...
          </div>
        </div>
      </div>
    )
  }

  if (invalidLink) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: '22px', fontWeight: 800, color: C.text, marginBottom: '12px' }}>
            Invalid reset link
          </div>
          <div style={{ color: C.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>
            This link is missing required parameters. Please request a new one.
          </div>
          <a
            href="/?forgot=1"
            style={{ color: C.accent, fontWeight: 600, fontSize: '14px', textDecoration: 'none' }}
          >
            Request a new reset link
          </a>
        </div>
      </div>
    )
  }

  if (verifyError) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: '22px', fontWeight: 800, color: C.text, marginBottom: '12px' }}>
            Link expired
          </div>
          <div style={{ color: C.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>
            This reset link has expired or has already been used. Please request a new one.
          </div>
          <a
            href="/?forgot=1"
            style={{ color: C.accent, fontWeight: 600, fontSize: '14px', textDecoration: 'none' }}
          >
            Request a new reset link
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: '22px', fontWeight: 800, color: C.text, letterSpacing: '-0.4px', marginBottom: '6px' }}>
          Set new password
        </div>
        <div style={{ color: C.muted, fontSize: '13px', marginBottom: '28px' }}>
          Choose a password of at least 12 characters.
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#2d3748', fontSize: '13px', pointerEvents: 'none' }}>🔑</span>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={submitting}
              style={inputStyle}
              autoFocus
            />
          </div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#2d3748', fontSize: '13px', pointerEvents: 'none' }}>🔑</span>
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              disabled={submitting}
              style={inputStyle}
            />
          </div>

          {formError && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.error}`,
              borderRadius: '8px', padding: '10px', fontSize: '13px', color: C.error,
            }}>
              {formError}
            </div>
          )}

          <button type="submit" disabled={submitting} style={btnStyle(submitting)}>
            {submitting ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
