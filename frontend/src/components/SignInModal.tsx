import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif"

function NavCompassIcon() {
  return (
    <svg width="22" height="22" viewBox="-10 -10 260 260" fill="none" style={{ transform: 'rotate(30deg)' }}>
      <defs>
        <filter id="siModalGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx="120" cy="120" r="114" stroke="#a78bfa" strokeWidth="5" opacity="0.9"/>
      <circle cx="120" cy="120" r="78" stroke="#7c6af7" strokeWidth="2.5" strokeDasharray="5 7" opacity="0.7"/>
      <circle cx="120" cy="120" r="114" stroke="#c4b5fd" strokeWidth="3"
        strokeDasharray="28 688" opacity="0.95" filter="url(#siModalGlow)"
        style={{ animation: 'siModalSpin 14s linear infinite', transformOrigin: '120px 120px' }}/>
      <polygon points="120,14 127,88 120,102 113,88" fill="#ef4444" opacity="0.95"/>
      <polygon points="120,226 127,152 120,138 113,152" fill="#7c6af7" opacity="0.65"/>
      <circle cx="120" cy="120" r="12" fill="#0d0f1a" stroke="#a78bfa" strokeWidth="3" opacity="0.95"/>
      <circle cx="120" cy="120" r="5" fill="#a78bfa" opacity="1"/>
    </svg>
  )
}

interface SignInModalProps {
  onClose: () => void
}

export default function SignInModal({ onClose }: SignInModalProps) {
  const { signInWithGoogle, signInWithEmail, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const busy = loading || submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!email.trim() || !password) { setFormError('Email and password are required.'); return }
    setSubmitting(true)
    try {
      await signInWithEmail(email.trim(), password)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setFormError(e?.message || 'Sign in failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes siModalSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .si-modal-backdrop { animation: siFadeIn 0.18s ease; }
        .si-modal-panel { animation: siSlideUp 0.22s cubic-bezier(0.16,1,0.3,1); }
        @keyframes siFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes siSlideUp { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .si-input { box-sizing: border-box; }
        .si-input:focus { border-color: #7c6af7 !important; outline: none; }
        .si-close:hover { color: #e2e8f0 !important; background: rgba(255,255,255,0.08) !important; }
      `}</style>

      {/* Backdrop */}
      <div
        className="si-modal-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(4,5,10,0.72)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
        }}
      >
        {/* Panel */}
        <div
          className="si-modal-panel"
          onClick={e => e.stopPropagation()}
          style={{
            background: '#0d0f1a',
            border: '1px solid #1e2235',
            borderRadius: '20px',
            padding: '40px',
            width: '100%',
            maxWidth: '420px',
            position: 'relative',
            boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,106,247,0.08)',
            fontFamily: FONT,
            color: '#e2e8f0',
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="si-close"
            style={{
              position: 'absolute', top: '16px', right: '16px',
              width: '30px', height: '30px', borderRadius: '8px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#4b5563', fontSize: '16px', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s, background 0.15s',
            }}
          >✕</button>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '28px' }}>
            <div style={{
              width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(124,106,247,0.12)', border: '1px solid rgba(124,106,247,0.35)',
              borderRadius: '8px', filter: 'drop-shadow(0 0 6px rgba(124,106,247,0.4))', flexShrink: 0,
            }}>
              <NavCompassIcon />
            </div>
            <span style={{ fontSize: '18px', fontWeight: 700 }}>
              Options<span style={{ color: '#7c6af7' }}>Compass</span>
            </span>
          </div>

          {/* Title */}
          <div style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px', marginBottom: '4px' }}>
            Welcome back
          </div>
          <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '28px' }}>
            Sign in to your Options Compass account
          </div>

          {/* Google */}
          <button
            onClick={signInWithGoogle}
            disabled={busy}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%',
              padding: '13px', background: '#fff', color: '#111', border: 'none', borderRadius: '10px',
              fontSize: '14px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
              gap: '10px', marginBottom: '18px', fontFamily: FONT,
              boxShadow: '0 2px 12px rgba(0,0,0,0.4)', opacity: busy ? 0.7 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
            <div style={{ flex: 1, height: '1px', background: '#1a1d2e' }} />
            <span style={{ fontSize: '12px', color: '#2d3748' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: '#1a1d2e' }} />
          </div>

          {/* Email / password form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#2d3748', fontSize: '13px', pointerEvents: 'none' }}>✉</span>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={busy}
                className="si-input"
                style={{
                  width: '100%', padding: '12px 14px 12px 40px',
                  background: '#08090f', border: '1px solid #1e2235',
                  borderRadius: '10px', color: '#e2e8f0', fontSize: '14px',
                  fontFamily: FONT, transition: 'border-color 0.2s',
                }}
              />
            </div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#2d3748', fontSize: '13px', pointerEvents: 'none' }}>🔑</span>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={busy}
                className="si-input"
                style={{
                  width: '100%', padding: '12px 14px 12px 40px',
                  background: '#08090f', border: '1px solid #1e2235',
                  borderRadius: '10px', color: '#e2e8f0', fontSize: '14px',
                  fontFamily: FONT, transition: 'border-color 0.2s',
                }}
              />
            </div>

            {formError && (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444',
                borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#ef4444',
              }}>
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{
                width: '100%', padding: '13px', marginTop: '4px',
                background: '#7c6af7', border: 'none', borderRadius: '10px',
                color: '#fff', fontSize: '15px', fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer', letterSpacing: '0.02em',
                fontFamily: FONT, opacity: busy ? 0.7 : 1,
                boxShadow: '0 4px 20px rgba(124,106,247,0.35)',
              }}
            >
              {submitting ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>

          {/* Trust row */}
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '24px', flexWrap: 'wrap' }}>
            {[['🔐', 'Secure sign-in'], ['🛡️', 'Encrypted'], ['🆓', 'Free tier']].map(([icon, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#2d3748' }}>
                <span>{icon}</span>{label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
