import { useEffect } from 'react'

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif"

const C = {
  bg:       '#08090f',
  surface:  '#0d0f1a',
  surface2: '#131628',
  border:   '#1e2235',
  text:     '#e2e8f0',
  muted:    '#64748b',
  accent:   '#7c6af7',
  accent2:  '#a78bfa',
  green:    '#22c55e',
  red:      '#ef4444',
}

interface HomePageProps {
  onSignIn: () => void
  onSignUp: () => void
}

// ── Compass SVG (nav-size, 26px icon) ──────────────────────────────────────
function NavCompassIcon() {
  return (
    <svg width="26" height="26" viewBox="-10 -10 260 260" fill="none"
      style={{ transform: 'rotate(30deg)' }}>
      <defs>
        <filter id="navGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx="120" cy="120" r="114" stroke="#a78bfa" strokeWidth="5" opacity="0.9"/>
      <circle cx="120" cy="120" r="78" stroke="#7c6af7" strokeWidth="2.5"
        strokeDasharray="5 7" opacity="0.7"/>
      <circle cx="120" cy="120" r="114" stroke="#c4b5fd" strokeWidth="3"
        strokeDasharray="28 688" opacity="0.95"
        filter="url(#navGlow)"
        style={{ animation: 'compassSpin 14s linear infinite', transformOrigin: '120px 120px' }}/>
      <polygon points="120,14 127,88 120,102 113,88" fill="#ef4444" opacity="0.95"/>
      <polygon points="120,226 127,152 120,138 113,152" fill="#7c6af7" opacity="0.65"/>
      <circle cx="120" cy="120" r="12" fill="#0d0f1a" stroke="#a78bfa" strokeWidth="3" opacity="0.95"/>
      <circle cx="120" cy="120" r="5" fill="#a78bfa" opacity="1"/>
    </svg>
  )
}

// ── Hero compass (large, ~380px) ──────────────────────────────────────────
function HeroCompassSVG() {
  return (
    <svg viewBox="-45 -61 330 346" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="cometGlowHP" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx="120" cy="120" r="155" stroke="#7c6af7" strokeWidth="0.6" opacity="0.18"/>
      <path d="M 30 -25 A 155 155 0 0 1 210 -25"
        stroke="#c4b5fd" strokeWidth="2.5" strokeLinecap="round" opacity="0.45" filter="url(#cometGlowHP)" fill="none"/>
      <path d="M 60 -32 A 155 155 0 0 1 180 -32"
        stroke="#e2d9f3" strokeWidth="1" strokeLinecap="round" opacity="0.60" fill="none"/>
      <circle cx="120" cy="120" r="155" stroke="#a78bfa" strokeWidth="1.5"
        strokeDasharray="30 945" strokeDashoffset="0" opacity="0.70"
        filter="url(#cometGlowHP)"
        style={{ animation: 'compassSpin 14s linear infinite', transformOrigin: '120px 120px' }}/>
      <circle cx="120" cy="120" r="114" stroke="#7c6af7" strokeWidth="2"   opacity="0.25"/>
      <circle cx="120" cy="120" r="106" stroke="#7c6af7" strokeWidth="0.5" opacity="0.16"/>
      <circle cx="120" cy="120" r="80"  stroke="#7c6af7" strokeWidth="0.8" strokeDasharray="2 4" opacity="0.15"/>
      <circle cx="120" cy="120" r="52"  stroke="#a78bfa" strokeWidth="0.6" opacity="0.18"/>
      <circle cx="120" cy="120" r="22"  stroke="#7c6af7" strokeWidth="1"   fill="rgba(124,106,247,0.06)" opacity="0.25"/>
      <g stroke="#7c6af7" opacity="0.16">
        <line x1="120" y1="6"   x2="120" y2="22"  strokeWidth="2"/>
        <line x1="120" y1="218" x2="120" y2="234" strokeWidth="2"/>
        <line x1="6"   y1="120" x2="22"  y2="120" strokeWidth="2"/>
        <line x1="218" y1="120" x2="234" y2="120" strokeWidth="2"/>
        <line x1="200.6" y1="39.4"  x2="193"   y2="47"    strokeWidth="1.4"/>
        <line x1="39.4"  y1="39.4"  x2="47"    y2="47"    strokeWidth="1.4"/>
        <line x1="200.6" y1="200.6" x2="193"   y2="193"   strokeWidth="1.4"/>
        <line x1="39.4"  y1="200.6" x2="47"    y2="193"   strokeWidth="1.4"/>
        <line x1="177"   y1="17.3"  x2="173.6" y2="23.3"  strokeWidth="1"/>
        <line x1="63"    y1="17.3"  x2="66.4"  y2="23.3"  strokeWidth="1"/>
        <line x1="222.7" y1="63"    x2="216.7" y2="66.4"  strokeWidth="1"/>
        <line x1="222.7" y1="177"   x2="216.7" y2="173.6" strokeWidth="1"/>
        <line x1="17.3"  y1="63"    x2="23.3"  y2="66.4"  strokeWidth="1"/>
        <line x1="17.3"  y1="177"   x2="23.3"  y2="173.6" strokeWidth="1"/>
        <line x1="177"   y1="222.7" x2="173.6" y2="216.7" strokeWidth="1"/>
        <line x1="63"    y1="222.7" x2="66.4"  y2="216.7" strokeWidth="1"/>
        <line x1="150.7" y1="9.6"   x2="149.3" y2="14.3"  strokeWidth="0.6"/>
        <line x1="89.3"  y1="9.6"   x2="90.7"  y2="14.3"  strokeWidth="0.6"/>
        <line x1="209.6" y1="89.3"  x2="204.9" y2="90.7"  strokeWidth="0.6" opacity="0.6"/>
        <line x1="209.6" y1="150.7" x2="204.9" y2="149.3" strokeWidth="0.6" opacity="0.6"/>
        <line x1="10.4"  y1="89.3"  x2="15.1"  y2="90.7"  strokeWidth="0.6" opacity="0.6"/>
        <line x1="10.4"  y1="150.7" x2="15.1"  y2="149.3" strokeWidth="0.6" opacity="0.6"/>
        <line x1="150.7" y1="230.4" x2="149.3" y2="225.7" strokeWidth="0.6" opacity="0.6"/>
        <line x1="89.3"  y1="230.4" x2="90.7"  y2="225.7" strokeWidth="0.6" opacity="0.6"/>
      </g>
      <polygon points="120,10 127,85 120,100 113,85" fill="#ef4444" opacity="0.95"/>
      <polygon points="120,8 130,20 120,26 110,20" fill="#ef4444" opacity="0.95"/>
      <line x1="105" y1="18" x2="120" y2="28" stroke="#e2e8f0" strokeWidth="0.8" opacity="0.4"/>
      <line x1="135" y1="18" x2="120" y2="28" stroke="#e2e8f0" strokeWidth="0.8" opacity="0.4"/>
      <polygon points="120,230 127,155 120,140 113,155" fill="#7c6af7" opacity="0.22"/>
      <polygon points="230,120 155,125 140,120 155,115" fill="#7c6af7" opacity="0.18"/>
      <polygon points="10,120 85,125 100,120 85,115"   fill="#7c6af7" opacity="0.18"/>
      <circle cx="120" cy="120" r="13" fill="#07090f" stroke="#7c6af7" strokeWidth="1.5" opacity="0.38"/>
      <circle cx="120" cy="120" r="5.5" fill="#7c6af7" opacity="0.45"/>
      <circle cx="120" cy="120" r="2.5" fill="#e2e8f0" opacity="0.62"/>
      <text x="120" y="-22" textAnchor="middle" fontSize="13" fontWeight="900"
        fill="#ef4444" opacity="1" fontFamily="Georgia, serif"
        transform="rotate(-30 120 -22)">N</text>
      <text x="120"  y="253" textAnchor="middle" fontSize="9" fill="#7c6af7" opacity="0.25" fontFamily="monospace" transform="rotate(-30 120 253)">S</text>
      <text x="262"  y="128" textAnchor="middle" fontSize="9" fill="#7c6af7" opacity="0.22" fontFamily="monospace" transform="rotate(-30 262 128)">E</text>
      <text x="-22"  y="128" textAnchor="middle" fontSize="9" fill="#7c6af7" opacity="0.22" fontFamily="monospace" transform="rotate(-30 -22 128)">W</text>
    </svg>
  )
}

// ── Footer compass (small, 24px icon) ────────────────────────────────────
function FooterCompassIcon() {
  return (
    <svg width="24" height="24" viewBox="-10 -10 260 260" fill="none"
      style={{ transform: 'rotate(30deg)' }}>
      <circle cx="120" cy="120" r="114" stroke="#a78bfa" strokeWidth="5" opacity="0.9"/>
      <circle cx="120" cy="120" r="78"  stroke="#7c6af7" strokeWidth="2.5"
        strokeDasharray="5 7" opacity="0.7"/>
      <polygon points="120,14 127,88 120,102 113,88" fill="#ef4444" opacity="0.95"/>
      <polygon points="120,226 127,152 120,138 113,152" fill="#7c6af7" opacity="0.65"/>
      <circle cx="120" cy="120" r="12" fill="#0d0f1a" stroke="#a78bfa" strokeWidth="3" opacity="0.95"/>
      <circle cx="120" cy="120" r="5"  fill="#a78bfa" opacity="1"/>
    </svg>
  )
}

const TICKERS = [
  { sym: 'SPY',  price: '590.12', chg: '▲ 1.2%',  up: true },
  { sym: 'QQQ',  price: '502.44', chg: '▲ 0.8%',  up: true },
  { sym: 'VIX',  price: '18.40',  chg: '▼ 3.2%',  up: false },
  { sym: 'TSLA', price: '245.80', chg: '▲ 2.1%',  up: true },
  { sym: 'NVDA', price: '138.40', chg: '▲ 1.7%',  up: true },
  { sym: 'IWM',  price: '213.50', chg: '▼ 0.5%',  up: false },
]

const EDU_CARDS = [
  { icon: '📊', title: 'Options Chain Analysis', desc: 'See bids, asks, IV, and greeks (approximately 15 min delayed) across every strike and expiry for any ticker. Learn to read an options chain the way a market maker does.' },
  { icon: '🧠', title: 'AI Strategy Ranking', desc: 'Our engine scores all 31 professional options strategies against the current IV environment, directional bias, earnings dates, and sentiment — and explains the fit in plain English. You decide whether to act.' },
  { icon: '📈', title: 'Paper Trading with Real Prices', desc: 'Place simulated trades. Track your P&L, manage positions, and build the pattern recognition that comes only from repetition.' },
  { icon: '⚠️', title: 'Risk Monitoring', desc: 'Watch your portfolio Greeks in real time. See the alerts when positions breach risk thresholds — delta, theta decay, DTE, and P&L stops — just like a real trading desk.' },
  { icon: '🔍', title: 'Strategy Scanner', desc: 'Run your full watchlist through the strategy engine simultaneously. Spot the best setups across multiple tickers ranked by fit score.' },
  { icon: '📰', title: 'Market Intelligence', desc: 'Earnings calendars, options flow, and news sentiment — synthesised together so you understand WHY a strategy fits right now, not just that it does.' },
]

const STEPS = [
  { n: 1, title: 'Pick any ticker', desc: 'Type any stock symbol. Options Compass pulls the full chain, quote, and market context automatically.' },
  { n: 2, title: 'Review the strategy rankings', desc: 'The engine analyses IV environment, directional bias, and earnings risk — then surfaces the best-fit strategies from 31 professional setups, ranked by fit score. You choose which, if any, to explore.' },
  { n: 3, title: 'Understand the trade', desc: 'A plain-English narrative explains what the trade is, why it fits, what needs to go wrong for it to lose, and how to manage it.' },
  { n: 4, title: 'Paper trade it', desc: 'Enter the trade with one click. It lands in your paper portfolio at delayed market prices. Track P&L, Greeks, and risk signals as the market moves.' },
  { n: 5, title: 'Review and improve', desc: 'The AI trade journal reviews your closed trades against established methodology rules — spotting patterns in what you did right and wrong.' },
]

type PricingTier = {
  name: string
  price: string
  priceIsTBD: boolean
  desc: string
  features: Array<{ text: string; included: boolean }>
  ctaLabel: string
  ctaStyle: 'ghost' | 'primary'
  featured?: boolean
}

const PRICING_TIERS: PricingTier[] = [
  {
    name: 'Free',
    price: '$0',
    priceIsTBD: false,
    desc: 'Everything you need to start learning options strategy.',
    features: [
      { text: 'Options chain viewer', included: true },
      { text: 'Basic strategy scanner', included: true },
      { text: 'AI strategy recommendation (limited)', included: true },
      { text: 'Small watchlist', included: true },
      { text: 'Paper trading', included: false },
      { text: 'Portfolio P&L tracking', included: false },
      { text: 'Risk monitor', included: false },
      { text: 'AI features', included: false },
    ],
    ctaLabel: 'Get Started',
    ctaStyle: 'ghost',
  },
  {
    name: 'Starter',
    price: 'TBD',
    priceIsTBD: true,
    desc: 'Paper trade with full position tracking and P&L history.',
    features: [
      { text: 'Everything in Free', included: true },
      { text: 'Paper trading', included: true },
      { text: 'Positions & P&L tracking', included: true },
      { text: '90-day portfolio chart', included: true },
      { text: 'Expanded watchlist', included: true },
      { text: 'Risk monitor', included: false },
      { text: 'Full AI suite', included: false },
      { text: 'Unlimited scanner scans', included: false },
    ],
    ctaLabel: 'Coming Soon',
    ctaStyle: 'ghost',
  },
  {
    name: 'Semi-Pro',
    price: 'TBD',
    priceIsTBD: true,
    desc: 'Full AI coaching, risk monitoring, and advanced strategy tools.',
    features: [
      { text: 'Everything in Starter', included: true },
      { text: 'Risk monitor & alerts', included: true },
      { text: 'AI morning briefing', included: true },
      { text: 'AI trade journal review', included: true },
      { text: 'AI roll advisor', included: true },
      { text: 'Portfolio Greeks coaching', included: true },
      { text: 'Unlimited scanner scans', included: true },
      { text: 'Priority support', included: false },
    ],
    ctaLabel: 'Coming Soon',
    ctaStyle: 'primary',
    featured: true,
  },
  {
    name: 'Pro',
    price: 'TBD',
    priceIsTBD: true,
    desc: 'Full platform access with priority support and maximum limits.',
    features: [
      { text: 'Everything in Semi-Pro', included: true },
      { text: 'Maximum watchlist size', included: true },
      { text: 'Unlimited everything', included: true },
      { text: 'Priority support', included: true },
      { text: 'Early access to new features', included: true },
      { text: 'Advanced scanner filters', included: true },
      { text: 'Full AI suite', included: true },
      { text: 'Export & reporting tools', included: true },
    ],
    ctaLabel: 'Coming Soon',
    ctaStyle: 'ghost',
  },
]

function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

export default function HomePage({ onSignIn, onSignUp }: HomePageProps) {
  // Inject keyframes once
  useEffect(() => {
    const id = 'hp-keyframes'
    if (!document.getElementById(id)) {
      const style = document.createElement('style')
      style.id = id
      style.textContent = `
        @keyframes compassSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ocPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.8); } }
        .hp-edu-card:hover { border-color: #7c6af7 !important; transform: translateY(-2px); }
        .hp-pricing-card:hover { transform: translateY(-3px); }
        .hp-btn-ghost:hover { border-color: #7c6af7 !important; color: #7c6af7 !important; }
        .hp-btn-primary:hover { opacity: 0.88; }
        .hp-btn-hero-primary:hover { opacity: 0.9; transform: translateY(-1px); }
        .hp-btn-hero-ghost:hover { border-color: #7c6af7 !important; color: #7c6af7 !important; }
        .hp-nav-link:hover { color: #e2e8f0 !important; }
        .hp-footer-link:hover { color: #e2e8f0 !important; }
        .hp-tier-cta:hover { opacity: 0.8; }
        @media (max-width: 900px) {
          .hp-hero-inner { flex-direction: column !important; padding: 60px 32px !important; gap: 40px !important; }
          .hp-hero-right { flex: none !important; width: 100% !important; }
          .hp-compass-wrap { width: 260px !important; height: 260px !important; }
        }
        @media (max-width: 700px) {
          .hp-nav { padding: 0 16px !important; }
          .hp-nav-links { display: none !important; }
          .hp-hero-inner { padding: 40px 20px !important; }
          .hp-section { padding: 60px 20px !important; }
          .hp-disclaimer-box { grid-template-columns: 1fr !important; }
          .hp-footer-grid { grid-template-columns: 1fr 1fr !important; }
          .hp-stats-bar { gap: 32px !important; padding: 24px 20px !important; }
          .hp-compass-wrap { width: 220px !important; height: 220px !important; }
        }
      `
      document.head.appendChild(style)
    }
  }, [])

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: FONT, lineHeight: 1.6, minHeight: '100vh' }}>

      {/* ══════════════════════════ NAV ══════════════════════════ */}
      <nav className="hp-nav" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(8,9,15,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${C.border}`,
        padding: '0 40px', height: '60px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button onClick={onSignIn} style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          fontSize: '18px', fontWeight: 700, color: C.text,
          background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT,
        }}>
          <div style={{
            width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(124,106,247,0.12)', border: '1px solid rgba(124,106,247,0.35)',
            borderRadius: '9px', filter: 'drop-shadow(0 0 6px rgba(124,106,247,0.45))',
          }}>
            <NavCompassIcon />
          </div>Options<span style={{ color: C.accent }}>Compass</span>
        </button>

        <ul className="hp-nav-links" style={{ display: 'flex', gap: '32px', listStyle: 'none', margin: 0, padding: 0 }}>
          {[['education', 'Education'], ['how-it-works', 'How It Works'], ['pricing', 'Pricing'], ['contact', 'Contact']].map(([id, label]) => (
            <li key={id}>
              <button onClick={() => scrollToSection(id)} className="hp-nav-link" style={{
                color: C.muted, background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '14px', fontWeight: 500, fontFamily: FONT, transition: 'color 0.2s',
              }}>{label}</button>
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={onSignIn} className="hp-btn-ghost" style={{
            background: 'transparent', border: `1px solid ${C.border}`, color: C.text,
            padding: '7px 18px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', fontFamily: FONT, transition: 'border-color 0.2s, color 0.2s',
          }}>Sign In</button>
          <button onClick={onSignUp} className="hp-btn-primary" style={{
            background: C.accent, border: 'none', color: '#fff',
            padding: '8px 20px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', fontFamily: FONT, transition: 'opacity 0.2s',
          }}>Sign Up Free</button>
        </div>
      </nav>

      {/* ══════════════════════════ HERO ══════════════════════════ */}
      <div id="top" style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(160deg, #0d0f1e 0%, #0a1020 60%, #08090f 100%)',
        minHeight: 'calc(100vh - 60px)',
        display: 'flex', alignItems: 'stretch',
      }}>
        {/* grid overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: `linear-gradient(rgba(124,106,247,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(124,106,247,0.04) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }} />
        {/* glow overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: `radial-gradient(ellipse at 25% 40%, rgba(124,106,247,0.13) 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(6,182,212,0.07) 0%, transparent 45%)`,
        }} />
        {/* chart watermark */}
        <svg style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '200px', opacity: 0.08, pointerEvents: 'none', zIndex: 0, width: '100%' }}
          viewBox="0 0 900 200" preserveAspectRatio="none">
          <defs>
            <linearGradient id="hpCg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c6af7" stopOpacity="0.4"/>
              <stop offset="100%" stopColor="#7c6af7" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d="M0,180 C60,160 90,185 140,148 S210,118 260,100 S330,76 380,60 S440,44 490,32 S550,18 600,10 S660,4 710,2 L900,0 L900,200 L0,200Z" fill="url(#hpCg)"/>
          <path d="M0,180 C60,160 90,185 140,148 S210,118 260,100 S330,76 380,60 S440,44 490,32 S550,18 600,10 S660,4 710,2 L900,0" fill="none" stroke="#7c6af7" strokeWidth="2"/>
        </svg>

        <div className="hp-hero-inner" style={{
          position: 'relative', zIndex: 1,
          maxWidth: '1200px', margin: '0 auto', width: '100%',
          display: 'flex', alignItems: 'center',
          padding: '80px 60px', gap: '60px',
        }}>
          {/* LEFT */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: '999px', padding: '4px 14px',
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', color: C.green,
              marginBottom: '28px',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.green, animation: 'ocPulse 2s ease-in-out infinite' }} />
              Educational Paper-Trading Platform
            </div>

            <h1 style={{
              fontSize: 'clamp(26px, 4vw, 44px)', fontWeight: 800, lineHeight: 1.22,
              marginBottom: '20px',
              background: 'linear-gradient(135deg, #e2e8f0 0%, #a78bfa 55%, #38bdf8 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              letterSpacing: '-0.4px',
            }}>
              You've always wanted to trade options.<br />We'll show you how.
            </h1>

            <p style={{ fontSize: 'clamp(15px, 1.15vw, 18px)', color: C.muted, maxWidth: '520px', marginBottom: '36px', lineHeight: 1.75 }}>
              Options Compass analyses current market data to calculate which options strategies
              fit today's conditions — then lets you paper trade them so you can watch how
              each position plays out in real time, monitor your P&L, and build the
              confidence to trade for real. Zero capital at risk.
            </p>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '36px' }}>
              <button onClick={onSignUp} className="hp-btn-hero-primary" style={{
                background: C.accent, border: 'none', color: '#fff',
                padding: '13px 32px', borderRadius: '9px', fontSize: '15px', fontWeight: 700,
                cursor: 'pointer', fontFamily: FONT,
                boxShadow: '0 4px 20px rgba(124,106,247,0.35)', transition: 'opacity 0.2s, transform 0.15s',
              }}>Start Learning Free</button>
              <button onClick={() => scrollToSection('education')} className="hp-btn-hero-ghost" style={{
                background: 'transparent', border: `1px solid ${C.border}`, color: C.text,
                padding: '13px 28px', borderRadius: '9px', fontSize: '15px', fontWeight: 600,
                cursor: 'pointer', fontFamily: FONT, transition: 'border-color 0.2s, color 0.2s',
              }}>See How It Works</button>
            </div>

            {/* Autonomy bar */}
            <div style={{
              padding: '18px 22px',
              background: 'rgba(124,106,247,0.07)', border: '1px solid rgba(124,106,247,0.22)',
              borderRadius: '12px', display: 'flex', alignItems: 'flex-start', gap: '14px',
            }}>
              <div style={{ fontSize: '22px', flexShrink: 0, marginTop: '1px' }}>🧭</div>
              <div>
                <h4 style={{ fontSize: 'clamp(13px, 1.0vw, 15px)', fontWeight: 700, color: C.accent2, marginBottom: '4px' }}>
                  You decide every trade — this is your compass, not a signal service
                </h4>
                <p style={{ fontSize: 'clamp(12px, 0.9vw, 14px)', color: C.muted, lineHeight: 1.65, maxWidth: '480px' }}>
                  Options Compass shows you which strategies fit the current market conditions
                  and why. What you do with that information is entirely your call — based on
                  your own read of the market, your risk comfort, and your learning goals.
                  This platform does not send trade signals or personalised investment advice.
                </p>
              </div>
            </div>

            {/* Ticker strip */}
            <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '10px', color: '#2d3748', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
                Market snapshot · refreshed throughout session
              </div>
              <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
                {TICKERS.map(t => (
                  <div key={t.sym} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <span style={{ fontSize: '10px', color: '#4b5563', fontWeight: 600, letterSpacing: '0.06em' }}>{t.sym}</span>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: '#94a3b8', fontFamily: 'monospace' }}>{t.price}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: t.up ? C.green : C.red }}>{t.chg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — compass */}
          <div className="hp-hero-right" style={{ flex: '0 0 420px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <div className="hp-compass-wrap" style={{ position: 'relative', width: '380px', height: '380px', transform: 'rotate(30deg)' }}>
              <div style={{
                position: 'absolute', inset: '-30px', borderRadius: '50%',
                background: 'radial-gradient(ellipse at center, rgba(124,106,247,0.18) 0%, transparent 65%)',
                pointerEvents: 'none', filter: 'blur(20px)',
              }} />
              <HeroCompassSVG />
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════ STATS ══════════════════════════ */}
      <div className="hp-stats-bar" style={{
        display: 'flex', justifyContent: 'center', gap: '60px',
        padding: '32px 40px', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
        background: C.surface, flexWrap: 'wrap',
      }}>
        {[
          { value: '31', label: 'Options Strategies' },
          { value: '~15 min', label: 'Typical Data Delay' },
          { value: '$0', label: 'Real Money at Risk' },
          { value: 'AI-Powered', label: 'Strategy Ranking' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'clamp(24px, 2.2vw, 36px)', fontWeight: 800, color: C.accent2 }}>{s.value}</div>
            <div style={{ fontSize: 'clamp(12px, 0.9vw, 14px)', color: C.muted, marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ══════════════════════════ EDUCATION ══════════════════════════ */}
      <section id="education" className="hp-section" style={{ padding: '80px 40px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: C.accent, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px' }}>Education First</div>
        <h2 style={{ fontSize: 'clamp(22px, 3.5vw, 34px)', fontWeight: 800, marginBottom: '14px', lineHeight: 1.25 }}>
          Learn options the way professionals do — by actually trading them
        </h2>
        <p style={{ fontSize: 'clamp(15px, 1.15vw, 18px)', color: C.muted, maxWidth: '620px', marginBottom: '52px', lineHeight: 1.7 }}>
          Most options education stops at theory. Options Compass puts you in the cockpit.
          Analyse real tickers, build real strategies, manage real risk — all in a safe,
          simulated environment powered by market data.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {EDU_CARDS.map(card => (
            <div key={card.title} className="hp-edu-card" style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: '14px', padding: '28px', transition: 'border-color 0.2s, transform 0.2s',
            }}>
              <div style={{
                width: '44px', height: '44px', background: 'rgba(124,106,247,0.12)',
                borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px', marginBottom: '16px',
              }}>{card.icon}</div>
              <h3 style={{ fontSize: 'clamp(15px, 1.2vw, 18px)', fontWeight: 700, marginBottom: '8px' }}>{card.title}</h3>
              <p style={{ fontSize: 'clamp(13px, 1.0vw, 15px)', color: C.muted, lineHeight: 1.6 }}>{card.desc}</p>
            </div>
          ))}
        </div>

        {/* Disclaimer box */}
        <div className="hp-disclaimer-box" style={{
          background: 'rgba(124,106,247,0.06)', border: '1px solid rgba(124,106,247,0.2)',
          borderRadius: '14px', padding: '32px 36px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginTop: '48px',
        }}>
          <div>
            <h3 style={{ fontSize: 'clamp(15px, 1.2vw, 18px)', fontWeight: 700, marginBottom: '10px', color: C.accent2 }}>
              Why we use delayed data — and why it barely matters
            </h3>
            <p style={{ fontSize: 'clamp(13px, 1.0vw, 15px)', color: C.muted, lineHeight: 1.7 }}>
              Options Compass uses Yahoo Finance data, which carries an approximate 15-minute
              delay for options quotes. This keeps subscription costs low — no expensive
              real-time exchange feeds.
            </p>
            <p style={{ fontSize: 'clamp(13px, 1.0vw, 15px)', color: C.muted, lineHeight: 1.7, marginTop: '12px' }}>
              For learning options strategy, a 15-minute delay is near real-time enough.
              You can see exactly how a strategy plays out against live market conditions,
              track your paper P&L against delayed market prices, and build genuine conviction
              — all at a fraction of the cost of a live data feed.
            </p>
          </div>
          <div>
            <h3 style={{ fontSize: 'clamp(15px, 1.2vw, 18px)', fontWeight: 700, marginBottom: '10px', color: C.accent2 }}>
              What you learn here transfers directly to real trading
            </h3>
            <p style={{ fontSize: 'clamp(13px, 1.0vw, 15px)', color: C.muted, lineHeight: 1.7, marginBottom: '10px' }}>
              The platform calculates which options strategies fit the current market
              conditions — IV environment, directional bias, earnings risk — and ranks them
              by fit score. You choose which setups to explore, paper trade them, and watch
              how each position evolves against delayed market prices.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                'Strategy selection logic and strike choice are identical with delayed or live data',
                'Greeks (delta, theta, vega, gamma) are model-calculated — unaffected by data delay',
                'Position sizing, stop rules, and roll mechanics are the same at any latency',
                'Earnings awareness and expiry selection are calendar-driven, not tick-driven',
                'Paper P&L tracks against delayed market prices — you see how the trade plays out against actual market moves',
              ].map(item => (
                <li key={item} style={{ fontSize: 'clamp(13px, 1.0vw, 15px)', color: C.muted, display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: C.green, fontWeight: 700, flexShrink: 0, marginTop: '1px' }}>✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── divider ── */}
      <div style={{ height: '1px', background: C.border, maxWidth: '1100px', margin: '0 auto' }} />

      {/* ══════════════════════════ HOW IT WORKS ══════════════════════════ */}
      <section id="how-it-works" className="hp-section" style={{ padding: '80px 40px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: C.accent, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px' }}>How It Works</div>
        <h2 style={{ fontSize: 'clamp(22px, 3.5vw, 34px)', fontWeight: 800, marginBottom: '14px', lineHeight: 1.25 }}>
          From zero to your first options trade in minutes
        </h2>
        <p style={{ fontSize: 'clamp(15px, 1.15vw, 18px)', color: C.muted, maxWidth: '620px', marginBottom: '52px', lineHeight: 1.7 }}>
          No prior options knowledge required. The platform guides you at every step.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginTop: '0' }}>
          {STEPS.map(step => (
            <div key={step.n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '14px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'rgba(124,106,247,0.15)', border: `1px solid ${C.accent}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 800, color: C.accent, flexShrink: 0,
              }}>{step.n}</div>
              <h4 style={{ fontSize: 'clamp(14px, 1.1vw, 17px)', fontWeight: 700, margin: 0 }}>{step.title}</h4>
              <p style={{ fontSize: 'clamp(13px, 1.0vw, 15px)', color: C.muted, lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── divider ── */}
      <div style={{ height: '1px', background: C.border, maxWidth: '1100px', margin: '0 auto' }} />

      {/* ══════════════════════════ PRICING ══════════════════════════ */}
      <section id="pricing" className="hp-section" style={{ padding: '80px 40px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: C.accent, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px' }}>Pricing</div>
        <h2 style={{ fontSize: 'clamp(22px, 3.5vw, 34px)', fontWeight: 800, marginBottom: '14px', lineHeight: 1.25 }}>
          Start free. Grow at your own pace.
        </h2>
        <p style={{ fontSize: 'clamp(15px, 1.15vw, 18px)', color: C.muted, maxWidth: '620px', marginBottom: '0', lineHeight: 1.7 }}>
          Every tier gives you real learning value. Upgrade when you're ready for more firepower.
          Prices are being finalised — sign up free today and lock in early access.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '18px', marginTop: '48px' }}>
          {PRICING_TIERS.map(tier => (
            <div key={tier.name} className="hp-pricing-card" style={{
              background: C.surface, borderRadius: '16px', padding: '28px 24px',
              display: 'flex', flexDirection: 'column', position: 'relative',
              border: tier.featured ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
              transition: 'transform 0.2s',
            }}>
              {tier.featured && (
                <div style={{
                  position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                  background: C.accent, color: '#fff', fontSize: '11px', fontWeight: 700,
                  padding: '3px 14px', borderRadius: '999px', letterSpacing: '0.05em',
                }}>MOST POPULAR</div>
              )}
              <div style={{ fontSize: '13px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{tier.name}</div>
              <div style={{ fontSize: 'clamp(28px, 2.6vw, 40px)', fontWeight: 900, color: C.text, lineHeight: 1 }}>
                {tier.priceIsTBD
                  ? <><span style={{ fontSize: 'clamp(16px, 1.3vw, 20px)', color: C.muted }}>TBD</span> <sub style={{ fontSize: 'clamp(12px, 0.9vw, 15px)', fontWeight: 500, color: C.muted }}>/mo</sub></>
                  : tier.price
                }
              </div>
              <div style={{ fontSize: 'clamp(12px, 0.9vw, 14px)', color: C.muted, margin: '10px 0 20px', lineHeight: 1.5 }}>{tier.desc}</div>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '9px', flex: 1 }}>
                {tier.features.map(f => (
                  <li key={f.text} style={{
                    fontSize: 'clamp(12px, 0.9vw, 14px)',
                    color: f.included ? C.text : C.muted,
                    display: 'flex', gap: '8px', alignItems: 'flex-start',
                  }}>
                    <span style={{ color: f.included ? C.green : C.border, flexShrink: 0 }}>{f.included ? '✓' : '—'}</span>
                    {f.text}
                  </li>
                ))}
              </ul>
              <button onClick={onSignUp} className="hp-tier-cta" style={{
                marginTop: '24px', padding: '10px', borderRadius: '8px',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer', textAlign: 'center',
                transition: 'opacity 0.2s', fontFamily: FONT,
                background: tier.ctaStyle === 'primary' ? C.accent : 'transparent',
                color: tier.ctaStyle === 'primary' ? '#fff' : C.text,
                border: tier.ctaStyle === 'primary' ? 'none' : `1px solid ${C.border}`,
              }}>{tier.ctaLabel}</button>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontSize: '12px', color: C.muted, marginTop: '24px' }}>
          All plans include a paper-trading simulator. No real money involved. No brokerage account required.
        </p>
      </section>

      {/* ── divider ── */}
      <div style={{ height: '1px', background: C.border, maxWidth: '1100px', margin: '0 auto' }} />

      {/* ══════════════════════════ CONTACT ══════════════════════════ */}
      <section id="contact" className="hp-section" style={{ padding: '80px 40px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: C.accent, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px' }}>Contact</div>
        <h2 style={{ fontSize: 'clamp(22px, 3.5vw, 34px)', fontWeight: 800, marginBottom: '14px', lineHeight: 1.25 }}>Get in touch</h2>
        <p style={{ fontSize: 'clamp(15px, 1.15vw, 18px)', color: C.muted, maxWidth: '620px', marginBottom: '36px', lineHeight: 1.7 }}>
          Have questions, feedback, or want to enquire about enterprise access? We'd love to hear from you.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          {[
            { icon: '✉️', title: 'General Enquiries', text: 'support@optionscompass.com', note: '(placeholder — to be updated)' },
            { icon: '💼', title: 'Enterprise & Partnerships', text: 'enterprise@optionscompass.com', note: '(placeholder — to be updated)' },
            { icon: '🐛', title: 'Bug Reports & Feedback', text: 'Use the in-app feedback button, or email support with the subject line "Feedback".', note: null },
            { icon: '📍', title: 'Company Details', text: 'Company name & registered address', note: '(placeholder — to be populated)' },
          ].map(card => (
            <div key={card.title} className="hp-edu-card" style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: '14px', padding: '28px', transition: 'border-color 0.2s, transform 0.2s',
            }}>
              <div style={{
                width: '44px', height: '44px', background: 'rgba(124,106,247,0.12)',
                borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px', marginBottom: '16px',
              }}>{card.icon}</div>
              <h3 style={{ fontSize: 'clamp(15px, 1.2vw, 18px)', fontWeight: 700, marginBottom: '8px' }}>{card.title}</h3>
              <p style={{ fontSize: 'clamp(13px, 1.0vw, 15px)', color: C.muted, lineHeight: 1.6, marginTop: '8px' }}>
                {card.text}
                {card.note && <><br /><em style={{ fontSize: '11px' }}>{card.note}</em></>}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════ FOOTER ══════════════════════════ */}
      <footer style={{ background: C.surface, borderTop: `1px solid ${C.border}`, padding: '48px 40px 32px', fontFamily: FONT }}>
        <div className="hp-footer-grid" style={{
          maxWidth: '1100px', margin: '0 auto 40px',
          display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '40px',
        }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{
                width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(124,106,247,0.12)', border: '1px solid rgba(124,106,247,0.35)',
                borderRadius: '9px', filter: 'drop-shadow(0 0 6px rgba(124,106,247,0.45))',
              }}><FooterCompassIcon /></div>
              <span style={{ fontWeight: 700, fontSize: '18px' }}>Options<span style={{ color: C.accent }}>Compass</span></span>
            </div>
            <p style={{ fontSize: '13px', color: C.muted, lineHeight: 1.7, maxWidth: '260px' }}>
              A paper-trading simulator for learning options strategies. For educational purposes only. Not financial advice.
            </p>
          </div>
          {[
            { heading: 'Platform', links: [['#education', 'Education'], ['#how-it-works', 'How It Works'], ['#pricing', 'Pricing'], ['#', 'Sign Up']] },
            { heading: 'Resources', links: [['#', 'User Guide'], ['#', 'FAQ'], ['#', 'Methodology'], ['#', 'Strategy Library']] },
            { heading: 'Legal', links: [['#', 'Terms of Service'], ['#', 'Privacy Policy'], ['#', 'Risk Disclaimer'], ['#contact', 'Contact']] },
          ].map(col => (
            <div key={col.heading}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '14px' }}>{col.heading}</h4>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {col.links.map(([href, label]) => (
                  <li key={label}>
                    <button onClick={() => { const id = href.replace('#', ''); if (id) scrollToSection(id) }} className="hp-footer-link" style={{
                      fontSize: '13px', color: C.muted, background: 'none', border: 'none',
                      cursor: 'pointer', fontFamily: FONT, padding: 0, transition: 'color 0.2s',
                    }}>{label}</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{
          maxWidth: '1100px', margin: '0 auto', paddingTop: '24px',
          borderTop: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: '12px',
        }}>
          <p style={{ fontSize: '12px', color: C.muted }}>© 2026 Options Compass. All rights reserved.</p>
          <div style={{ display: 'flex', gap: '20px' }}>
            {['Terms', 'Privacy', 'Risk Disclaimer'].map(l => (
              <button key={l} className="hp-footer-link" style={{
                fontSize: '12px', color: C.muted, background: 'none', border: 'none',
                cursor: 'pointer', fontFamily: FONT, padding: 0,
              }}>{l}</button>
            ))}
          </div>
        </div>

        <p style={{ maxWidth: '1100px', margin: '20px auto 0', fontSize: '11px', color: C.muted, opacity: 0.6, lineHeight: 1.6 }}>
          Options Compass is an educational paper-trading simulator. All trades are simulated. No real money is involved.
          Options Compass does not provide personalised investment advice, trade signals, or securities recommendations.
          Strategy rankings and fit scores are generated by an automated algorithm based on publicly available market
          data and are presented for educational purposes only. All trade decisions are made solely by the subscriber
          based on their own assessment of market conditions and personal risk tolerance.
          Market data is sourced from Yahoo Finance and is typically delayed by approximately 15 minutes; it is not
          a real-time feed. Options trading involves significant risk of loss and is not appropriate for all investors.
          Past simulated performance does not guarantee future real-money results.
          Always consult a licensed financial adviser before trading real options.
        </p>
      </footer>
    </div>
  )
}
