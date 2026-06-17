import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif"

type Mode = 'signin' | 'signup'

const FEATURES = [
  {
    icon: '⚡',
    iconBg: 'rgba(124,106,247,0.15)',
    iconBorder: 'rgba(124,106,247,0.25)',
    title: '31 Proven Strategies, Ranked for Today',
    desc: '• Iron condors, butterflies, straddles, verticals and more — automatically scored and ranked against the current IV environment and directional bias.',
    tag: '✦ AI-ranked',
    tagBg: 'rgba(124,106,247,0.1)',
    tagBorder: 'rgba(124,106,247,0.2)',
    tagColor: '#a78bfa',
  },
  {
    icon: '📡',
    iconBg: 'rgba(6,182,212,0.12)',
    iconBorder: 'rgba(6,182,212,0.22)',
    title: 'Continuously Refreshed Market Analysis',
    desc: '• Options chain data, implied volatility, and Greeks updated throughout the trading session — giving you a clear, current picture of which strategies are in their element and which aren\'t. Not tick-by-tick, but never stale.',
    tag: '↻ Refreshed every ~30s',
    tagBg: 'rgba(6,182,212,0.1)',
    tagBorder: 'rgba(6,182,212,0.2)',
    tagColor: '#06b6d4',
  },
  {
    icon: '🗺️',
    iconBg: 'rgba(59,130,246,0.12)',
    iconBorder: 'rgba(59,130,246,0.22)',
    title: 'Step-by-Step Market Entry Guide',
    desc: '• When you\'ve identified a strategy, the platform walks you through strike selection, expiry choice, position sizing, and the exact order to place — so you know precisely how to enter when you\'re ready for real markets.',
    tag: '📋 Trade-ready guidance',
    tagBg: 'rgba(245,158,11,0.1)',
    tagBorder: 'rgba(245,158,11,0.2)',
    tagColor: '#f59e0b',
  },
  {
    icon: '🤖',
    iconBg: 'rgba(245,158,11,0.12)',
    iconBorder: 'rgba(245,158,11,0.22)',
    title: 'AI Narrative on Every Strategy',
    desc: '• Plain-English breakdown of why a strategy fits — covering IV regime, earnings risk, news sentiment, and expected profit zones. No jargon, no guesswork.',
    tag: '✦ Powered by AI',
    tagBg: 'rgba(124,106,247,0.1)',
    tagBorder: 'rgba(124,106,247,0.2)',
    tagColor: '#a78bfa',
  },
  {
    icon: '🔒',
    iconBg: 'rgba(34,197,94,0.12)',
    iconBorder: 'rgba(34,197,94,0.22)',
    title: 'Paper Trading — Zero Capital at Risk',
    desc: '• Full position tracking, P&L monitoring, and risk alerts — all in a simulated environment. Build conviction in a strategy before deploying real money.',
    tag: '✓ Free tier included',
    tagBg: 'rgba(34,197,94,0.1)',
    tagBorder: 'rgba(34,197,94,0.2)',
    tagColor: '#22c55e',
  },
]

const TICKERS = [
  { sym: 'SPY',  price: '590.12', chg: '▲ 1.2%',  up: true },
  { sym: 'QQQ',  price: '502.44', chg: '▲ 0.8%',  up: true },
  { sym: 'VIX',  price: '18.40',  chg: '▼ 3.2%',  up: false },
  { sym: 'TSLA', price: '245.80', chg: '▲ 2.1%',  up: true },
  { sym: 'NVDA', price: '138.40', chg: '▲ 1.7%',  up: true },
  { sym: 'IWM',  price: '213.50', chg: '▼ 0.5%',  up: false },
]

export default function LoginPage() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, loading } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setSuccessMsg(null)
    if (!email.trim() || !password) { setFormError('Email and password are required.'); return }
    if (mode === 'signup' && password !== confirmPassword) { setFormError('Passwords do not match.'); return }
    if (mode === 'signup' && password.length < 8) { setFormError('Password must be at least 8 characters.'); return }
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        await signUpWithEmail(email.trim(), password)
        setSuccessMsg('Account created. Check your email to confirm your address before signing in.')
      } else {
        await signInWithEmail(email.trim(), password)
      }
    } catch (e: unknown) {
      const err = e as { message?: string }
      setFormError(err?.message || 'Authentication failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const switchMode = (m: Mode) => { setMode(m); setFormError(null); setSuccessMsg(null) }
  const busy = loading || submitting

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#08090f', fontFamily: FONT, color: '#e2e8f0' }}>

      {/* ── LEFT — marketing panel (hidden on narrow screens via CSS var) ── */}
      <div style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(160deg, #0d0f1e 0%, #0a1020 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '56px 52px',
        borderRight: '1px solid #1a1d2e',
      }}
        className="login-left-panel"
      >
        {/* Background glows */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(ellipse at 25% 35%, rgba(124,106,247,0.10) 0%, transparent 55%), radial-gradient(ellipse at 75% 75%, rgba(6,182,212,0.07) 0%, transparent 50%)',
        }} />
        {/* Subtle grid */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(124,106,247,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(124,106,247,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        {/* Compass watermark — top-right, 45° CW, nautical layered style */}
        <div style={{
          position: 'absolute', top: '20%', right: '-6%',
          width: '42%', height: '42%',
          pointerEvents: 'none',
          transform: 'rotate(45deg)',
          transformOrigin: 'center center',
          zIndex: 0,
        }}>
          <svg viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            {/* three concentric rings */}
            <circle cx="120" cy="120" r="114" stroke="#7c6af7" strokeWidth="2"   opacity="0.25"/>
            <circle cx="120" cy="120" r="106" stroke="#7c6af7" strokeWidth="0.5" opacity="0.16"/>
            <circle cx="120" cy="120" r="80"  stroke="#7c6af7" strokeWidth="0.8" strokeDasharray="2 4" opacity="0.15"/>
            <circle cx="120" cy="120" r="52"  stroke="#a78bfa" strokeWidth="0.6" opacity="0.18"/>
            <circle cx="120" cy="120" r="22"  stroke="#7c6af7" strokeWidth="1"   fill="rgba(124,106,247,0.06)" opacity="0.25"/>
            {/* dense tick marks */}
            <g stroke="#7c6af7" opacity="0.16">
              {/* major every 90° */}
              <line x1="120" y1="6"   x2="120" y2="22"  strokeWidth="2"/>
              <line x1="120" y1="218" x2="120" y2="234" strokeWidth="2"/>
              <line x1="6"   y1="120" x2="22"  y2="120" strokeWidth="2"/>
              <line x1="218" y1="120" x2="234" y2="120" strokeWidth="2"/>
              {/* 45° */}
              <line x1="200.6" y1="39.4" x2="193" y2="47"   strokeWidth="1.4"/>
              <line x1="39.4"  y1="39.4" x2="47"  y2="47"   strokeWidth="1.4"/>
              <line x1="200.6" y1="200.6" x2="193" y2="193" strokeWidth="1.4"/>
              <line x1="39.4"  y1="200.6" x2="47"  y2="193" strokeWidth="1.4"/>
              {/* 30° */}
              <line x1="177"   y1="17.3" x2="173.6" y2="23.3" strokeWidth="1"/>
              <line x1="63"    y1="17.3" x2="66.4"  y2="23.3" strokeWidth="1"/>
              <line x1="222.7" y1="63"   x2="216.7" y2="66.4" strokeWidth="1"/>
              <line x1="222.7" y1="177"  x2="216.7" y2="173.6" strokeWidth="1"/>
              <line x1="17.3"  y1="63"   x2="23.3"  y2="66.4" strokeWidth="1"/>
              <line x1="17.3"  y1="177"  x2="23.3"  y2="173.6" strokeWidth="1"/>
              <line x1="177"   y1="222.7" x2="173.6" y2="216.7" strokeWidth="1"/>
              <line x1="63"    y1="222.7" x2="66.4"  y2="216.7" strokeWidth="1"/>
              {/* 15° fine ticks */}
              <line x1="150.7" y1="9.6"   x2="149.3" y2="14.3" strokeWidth="0.6"/>
              <line x1="89.3"  y1="9.6"   x2="90.7"  y2="14.3" strokeWidth="0.6"/>
              <line x1="209.6" y1="89.3"  x2="204.9" y2="90.7" strokeWidth="0.6" opacity="0.6"/>
              <line x1="209.6" y1="150.7" x2="204.9" y2="149.3" strokeWidth="0.6" opacity="0.6"/>
              <line x1="10.4"  y1="89.3"  x2="15.1"  y2="90.7" strokeWidth="0.6" opacity="0.6"/>
              <line x1="10.4"  y1="150.7" x2="15.1"  y2="149.3" strokeWidth="0.6" opacity="0.6"/>
              <line x1="150.7" y1="230.4" x2="149.3" y2="225.7" strokeWidth="0.6" opacity="0.6"/>
              <line x1="89.3"  y1="230.4" x2="90.7"  y2="225.7" strokeWidth="0.6" opacity="0.6"/>
            </g>
            {/* N arrow — wide fleur style */}
            <polygon points="120,10 127,85 120,100 113,85" fill="#e2e8f0" opacity="0.58"/>
            {/* fleur arrowhead */}
            <polygon points="120,8 130,20 120,26 110,20" fill="#e2e8f0" opacity="0.72"/>
            <line x1="105" y1="18" x2="120" y2="28" stroke="#e2e8f0" strokeWidth="0.8" opacity="0.4"/>
            <line x1="135" y1="18" x2="120" y2="28" stroke="#e2e8f0" strokeWidth="0.8" opacity="0.4"/>
            {/* S arrow */}
            <polygon points="120,230 127,155 120,140 113,155" fill="#7c6af7" opacity="0.22"/>
            {/* E/W subtle marks */}
            <polygon points="230,120 155,125 140,120 155,115" fill="#7c6af7" opacity="0.18"/>
            <polygon points="10,120 85,125 100,120 85,115"   fill="#7c6af7" opacity="0.18"/>
            {/* centre */}
            <circle cx="120" cy="120" r="13" fill="#07090f" stroke="#7c6af7" strokeWidth="1.5" opacity="0.38"/>
            <circle cx="120" cy="120" r="5.5" fill="#7c6af7" opacity="0.45"/>
            <circle cx="120" cy="120" r="2.5" fill="#e2e8f0" opacity="0.62"/>
            {/* N label counter-rotated */}
            <text x="120" y="20" textAnchor="middle" fontSize="12" fontWeight="900"
              fill="#e2e8f0" opacity="0.72" fontFamily="Georgia, serif"
              transform="rotate(-45 120 20)">N</text>
            {/* S/E/W labels subtle */}
            <text x="120" y="237" textAnchor="middle" fontSize="9" fill="#7c6af7" opacity="0.25" fontFamily="monospace" transform="rotate(-45 120 237)">S</text>
            <text x="236" y="124" textAnchor="middle" fontSize="9" fill="#7c6af7" opacity="0.22" fontFamily="monospace" transform="rotate(-45 236 124)">E</text>
            <text x="5"   y="124" textAnchor="middle" fontSize="9" fill="#7c6af7" opacity="0.22" fontFamily="monospace" transform="rotate(-45 5 124)">W</text>
          </svg>
        </div>

        {/* Chart watermark */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '260px', opacity: 0.12, pointerEvents: 'none' }}>
          <svg viewBox="0 0 900 260" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c6af7" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#7c6af7" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0,230 C60,210 90,240 140,195 S210,165 260,145 S330,112 380,98 S440,82 490,68 S550,50 600,38 S660,22 710,14 L900,4 L900,260 L0,260Z" fill="url(#cg)" />
            <path d="M0,230 C60,210 90,240 140,195 S210,165 260,145 S330,112 380,98 S440,82 490,68 S550,50 600,38 S660,22 710,14 L900,4" fill="none" stroke="#7c6af7" strokeWidth="2" />
          </svg>
        </div>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '40px', position: 'relative', zIndex: 1 }}>
          <span style={{ fontSize: '26px', color: '#7c6af7', filter: 'drop-shadow(0 0 8px rgba(124,106,247,0.5))' }}>⬡</span>
          <span style={{ fontSize: '36px', fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.4px' }}>
            Options<span style={{ color: '#7c6af7' }}>Compass</span>
          </span>
          <div style={{
            marginLeft: '6px', padding: '2px 8px', borderRadius: '20px',
            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
            fontSize: '10px', color: '#22c55e', fontWeight: 700, letterSpacing: '0.04em',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'ocPulse 2s ease-in-out infinite' }} />
            LIVE
          </div>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: '24px', fontWeight: 900, lineHeight: 1.3, letterSpacing: '-0.8px', marginBottom: '16px', position: 'relative', zIndex: 1 }}>
          <span style={{
            background: 'linear-gradient(135deg, #e2e8f0 0%, #a78bfa 55%, #38bdf8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            You have always wanted to trade options but don't know how to go about it?<br />We will show you how.
          </span>
        </h1>

        {/* Sub-header */}
        <h2 style={{ fontSize: '24px', fontWeight: 900, lineHeight: 1.3, letterSpacing: '-0.8px', marginBottom: '16px', position: 'relative', zIndex: 1, color: '#a78bfa', whiteSpace: 'nowrap' }}>
          Options strategy intelligence, built for serious learners.
        </h2>

        <p style={{ fontSize: '15px', color: '#e2e8f0', lineHeight: 1.65, maxWidth: '420px', marginBottom: '36px', position: 'relative', zIndex: 1 }}>
          Continuously refreshed market data powering a full strategy suite — so you always know which trade fits today's market, before you commit real capital.
        </p>

        {/* Feature list */}
        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '14px',
              padding: '14px 0',
              borderBottom: i < FEATURES.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}>
              <div style={{
                width: '34px', height: '34px', borderRadius: '9px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px',
                background: f.iconBg, border: `1px solid ${f.iconBorder}`,
              }}>
                {f.icon}
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#cbd5e1', marginBottom: '2px' }}>{f.title}</div>
                <div style={{ fontSize: '15px', color: '#e2e8f0', lineHeight: 1.5 }}>{f.desc}</div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '4px',
                  padding: '2px 8px', borderRadius: '10px',
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em',
                  background: f.tagBg, border: `1px solid ${f.tagBorder}`, color: f.tagColor,
                }}>
                  {f.tag}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Ticker strip */}
        <div style={{ position: 'relative', zIndex: 1, marginTop: '28px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <div style={{ fontSize: '10px', color: '#4a5568', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
            Market snapshot · refreshed throughout session
          </div>
          <div style={{ display: 'flex', gap: '24px', overflow: 'hidden' }}>
            {TICKERS.map(t => (
              <div key={t.sym} style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
                <div style={{ fontSize: '10px', color: '#4b5563', fontWeight: 700, letterSpacing: '0.06em' }}>{t.sym}</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#94a3b8', fontFamily: 'monospace' }}>{t.price}</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: t.up ? '#22c55e' : '#ef4444' }}>{t.chg}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT — login form ── */}
      <div style={{ width: '460px', minWidth: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px', background: '#08090f' }}>
        <div style={{ width: '100%' }}>

          <div style={{ fontSize: '26px', fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.5px', marginBottom: '4px' }}>
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </div>
          <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '32px' }}>
            {mode === 'signup' ? 'Start paper trading in under a minute' : 'Sign in to your Options Compass account'}
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', background: '#0d0f1a', border: '1px solid #1e2235', borderRadius: '10px', overflow: 'hidden', marginBottom: '24px', padding: '3px', gap: '3px' }}>
            {(['signin', 'signup'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                style={{
                  flex: 1, padding: '9px', border: 'none', borderRadius: '8px',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
                  background: mode === m ? '#7c6af7' : 'transparent',
                  color: mode === m ? '#fff' : '#4b5563',
                  boxShadow: mode === m ? '0 2px 8px rgba(124,106,247,0.3)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Google OAuth */}
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
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            {mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
            <div style={{ flex: 1, height: '1px', background: '#141727' }} />
            <span style={{ fontSize: '12px', color: '#2d3748' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: '#141727' }} />
          </div>

          {/* Form */}
          {successMsg ? (
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', borderRadius: '10px', padding: '12px', fontSize: '13px', color: '#22c55e', marginBottom: '16px' }}>
              {successMsg}
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              <div style={{ position: 'relative', marginBottom: '12px' }}>
                <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#2d3748', fontSize: '13px', pointerEvents: 'none' }}>✉</span>
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={busy}
                  style={{
                    width: '100%', padding: '12px 14px 12px 40px',
                    background: '#0d0f1a', border: '1px solid #1e2235',
                    borderRadius: '10px', color: '#e2e8f0', fontSize: '14px', fontFamily: FONT,
                    outline: 'none',
                  }}
                />
              </div>
              <div style={{ position: 'relative', marginBottom: mode === 'signup' ? '12px' : '0' }}>
                <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#2d3748', fontSize: '13px', pointerEvents: 'none' }}>🔑</span>
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={busy}
                  style={{
                    width: '100%', padding: '12px 14px 12px 40px',
                    background: '#0d0f1a', border: '1px solid #1e2235',
                    borderRadius: '10px', color: '#e2e8f0', fontSize: '14px', fontFamily: FONT,
                    outline: 'none',
                  }}
                />
              </div>
              {mode === 'signup' && (
                <div style={{ position: 'relative', marginBottom: '0' }}>
                  <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#2d3748', fontSize: '13px', pointerEvents: 'none' }}>🔑</span>
                  <input
                    type="password"
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    disabled={busy}
                    style={{
                      width: '100%', padding: '12px 14px 12px 40px',
                      background: '#0d0f1a', border: '1px solid #1e2235',
                      borderRadius: '10px', color: '#e2e8f0', fontSize: '14px', fontFamily: FONT,
                      outline: 'none',
                    }}
                  />
                </div>
              )}
              {mode === 'signin' && (
                <div style={{ textAlign: 'right', margin: '6px 0 16px' }}>
                  <span style={{ fontSize: '12px', color: '#2d3748', cursor: 'default' }}>Forgot password?</span>
                </div>
              )}
              {formError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#ef4444', margin: '12px 0' }}>
                  {formError}
                </div>
              )}
              <button
                type="submit"
                disabled={busy}
                style={{
                  width: '100%', padding: '13px',
                  background: '#7c6af7', border: 'none', borderRadius: '10px',
                  color: '#fff', fontSize: '15px', fontWeight: 700,
                  cursor: busy ? 'not-allowed' : 'pointer', letterSpacing: '0.02em',
                  fontFamily: FONT, opacity: busy ? 0.7 : 1,
                  boxShadow: '0 4px 20px rgba(124,106,247,0.35)',
                  marginTop: mode === 'signin' ? '0' : '12px',
                }}
              >
                {submitting
                  ? (mode === 'signup' ? 'Creating account...' : 'Signing in...')
                  : (mode === 'signup' ? 'Create Account →' : 'Sign In →')}
              </button>
            </form>
          )}

          {/* Switch mode */}
          <div style={{ marginTop: '28px', paddingTop: '24px', borderTop: '1px solid #141727', textAlign: 'center', fontSize: '13px', color: '#4b5563' }}>
            {mode === 'signup'
              ? <>Already have an account? <span onClick={() => switchMode('signin')} style={{ color: '#7c6af7', cursor: 'pointer', fontWeight: 600 }}>Sign in</span></>
              : <>New to Options Compass? <span onClick={() => switchMode('signup')} style={{ color: '#7c6af7', cursor: 'pointer', fontWeight: 600 }}>Create a free account</span></>}
          </div>

          {/* Trust row */}
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '24px', flexWrap: 'wrap' }}>
            {[['🔐', 'Secure sign-in'], ['🛡️', 'End-to-end encrypted'], ['🆓', 'Free tier available']].map(([icon, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#2d3748' }}>
                <span>{icon}</span> {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ocPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
        @media (max-width: 768px) {
          .login-left-panel { display: none !important; }
        }
      `}</style>
    </div>
  )
}
