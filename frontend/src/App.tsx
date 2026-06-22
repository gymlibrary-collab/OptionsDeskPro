import React, { useState, useCallback, useEffect, useRef } from 'react'
import QuoteBar from './components/QuoteBar'
import OptionsChain from './components/OptionsChain'
import TradePanel from './components/TradePanel'
import Positions from './components/Positions'
import StrategyScanner from './components/StrategyScanner'
import LoginPage from './components/LoginPage'
import HomePage from './components/HomePage'
import SignInModal from './components/SignInModal'
import PnLChart from './components/PnLChart'
import RiskMonitor from './components/RiskMonitor'
import UserGuide from './components/UserGuide'
import StrategyMethodologyPage from './components/StrategyMethodologyPage'
import TradingDesk from './components/TradingDesk'
import AISettings from './components/AISettings'
import OnboardingFlow from './components/OnboardingFlow'
import SettingsPage from './components/SettingsPage'
import PricingPage from './components/PricingPage'
import FaqPage from './components/FaqPage'
import LockedTabPlaceholder from './components/LockedTabPlaceholder'
import PaymentFailedBanner from './components/PaymentFailedBanner'
import AdminApp from './components/admin/AdminApp'
import LegalAcknowledgmentGate from './components/LegalAcknowledgmentGate'
import { AuthProvider, useAuth } from './context/AuthContext'
import { EntitlementsProvider, useEntitlements } from './context/EntitlementsContext'
import { useWindowSize } from './hooks/useWindowSize'
import { TradeStructure, getPublicConfig, getOptionsChain, getQuote, getWatchlist } from './api/client'
import api from './api/client'
import { createBillingPortalSession } from './api/client'

// ─── Portal mode switch ──────────────────────────────────────────────────────────
const PORTAL_MODE = (import.meta.env.VITE_PORTAL_MODE as string | undefined) || 'client'

type Desk = 'options' | 'trading'
type Tab = 'chain' | 'positions' | 'scanner' | 'methodology' | 'guide' | 'ai'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
  input: '#252836',
}

const _LAST_SYMBOL_KEY = 'od_last_symbol'

function Dashboard() {
  const { user, profile, signOut, entitlements, refreshEntitlements } = useAuth()
  const { paymentFailed } = useEntitlements()
  const { isMobile, isTablet } = useWindowSize()
  const [activeDesk, setActiveDesk] = useState<Desk>('options')
  const _init = localStorage.getItem(_LAST_SYMBOL_KEY) || 'QQQ'
  const [symbol, setSymbol] = useState(_init)
  const [inputSymbol, setInputSymbol] = useState(_init)
  const [chainDataSource, setChainDataSource] = useState<{ synthetic: boolean; estimatedPct: number; unavailable?: boolean } | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('chain')
  const [selectedTrade, setSelectedTrade] = useState<{ symbol: string; trade: TradeStructure } | null>(null)
  const [positionsRefresh, setPositionsRefresh] = useState(0)
  const [tradePanelOpen, setTradePanelOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPricing, setShowPricing] = useState(false)
  const [showFaq, setShowFaq] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [tradingDeskEnabled, setTradingDeskEnabled] = useState(true)

  // Set initial symbol to the first entry in the user's scanner watchlist.
  // Persists to localStorage so the next hard refresh prefetches the right symbol.
  useEffect(() => {
    getWatchlist().then(w => {
      const first = w.symbols?.[0]
      if (first) {
        localStorage.setItem(_LAST_SYMBOL_KEY, first)
        setSymbol(first)
        setInputSymbol(first)
        getOptionsChain(first).catch(() => {})
        getQuote(first).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  // MT-020: on mount, check for /settings or /onboarding paths (Stripe return URLs)
  useEffect(() => {
    const path = window.location.pathname
    if (path === '/settings/billing' || path === '/settings') {
      setShowSettings(true)
      // Clean URL without triggering navigation
      window.history.replaceState({}, '', '/')
    }
  }, [])

  useEffect(() => {
    getPublicConfig().then(cfg => {
      setAiEnabled(cfg.ai_features_enabled)
      setTradingDeskEnabled(cfg.trading_desk_enabled)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!tradingDeskEnabled && activeDesk === 'trading') setActiveDesk('options')
  }, [tradingDeskEnabled, activeDesk])

  useEffect(() => {
    if (!aiEnabled && activeTab === 'ai') setActiveTab('chain')
  }, [aiEnabled, activeTab])

  // Prefetch the chain while the user is still typing so data is ready by Go.
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleInputChange = useCallback((val: string) => {
    const s = val.toUpperCase()
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current)
    if (s.length >= 1) {
      prefetchTimer.current = setTimeout(() => {
        getOptionsChain(s).catch(() => {})
        getQuote(s).catch(() => {})
      }, 600)
    }
  }, [])

  const handleSearch = useCallback(() => {
    const s = inputSymbol.trim().toUpperCase()
    if (s) { setSymbol(s); setChainDataSource(null) }
  }, [inputSymbol])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleSelectTrade = useCallback((sym: string, trade: TradeStructure) => {
    setSelectedTrade({ symbol: sym, trade })
    if (isMobile) setTradePanelOpen(true)
  }, [isMobile])

  const handleTradeRecorded = useCallback(() => {
    setPositionsRefresh(n => n + 1)
    setTradePanelOpen(false)
  }, [])

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab)
    if (tab === 'positions') {
      api.post('/positions/snapshot').catch(() => {})
    }
  }, [])

  const handleUpdateCard = async () => {
    try {
      const { portal_url } = await createBillingPortalSession()
      window.location.href = portal_url
    } catch {
      setShowSettings(true)
    }
  }

  const handleUpgradeClick = () => {
    setShowPricing(true)
  }

  const features = entitlements?.features

  const tabs: { key: Tab; label: string; short: string; locked?: boolean; requiredTier?: string }[] = [
    { key: 'chain', label: 'Options Chain', short: 'Chain' },
    {
      key: 'positions',
      label: 'Positions',
      short: 'P&L',
      locked: features?.positions === false,
      requiredTier: 'starter',
    },
    { key: 'scanner', label: 'Strategy Scanner', short: 'Scanner' },
    { key: 'methodology', label: 'Methodology', short: 'How' },
    { key: 'guide', label: 'User Guide', short: 'Guide' },
    { key: 'ai', label: 'AI Features', short: 'AI' },
  ]

  const visibleTabs = tabs.filter(t => t.key !== 'ai' || aiEnabled)

  const displayName = (profile as unknown as { full_name?: string })?.full_name || user?.email || '?'
  const initials = displayName
    .split(' ')
    .map((p: string) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const profilePicUrl = (profile as unknown as { avatar_url?: string })?.avatar_url

  const showSidebar = !!selectedTrade && !isMobile && activeDesk === 'options' && activeTab !== 'guide' && activeTab !== 'methodology' && activeTab !== 'ai'

  if (showSettings) {
    return (
      <SettingsPage
        onClose={() => { setShowSettings(false); refreshEntitlements() }}
        onUpgradeClick={() => { setShowSettings(false); setShowPricing(true) }}
      />
    )
  }

  if (showPricing) {
    return (
      <PricingPage
        onClose={() => setShowPricing(false)}
        currentTier={entitlements?.effective_tier}
      />
    )
  }

  if (showFaq) {
    return <FaqPage onClose={() => setShowFaq(false)} />
  }

  const deskBtn = (desk: Desk, label: string) => (
    <button
      onClick={() => setActiveDesk(desk)}
      style={{
        background: activeDesk === desk ? C.accent : 'transparent',
        border: `1px solid ${activeDesk === desk ? C.accent : '#3a3f5c'}`,
        borderRadius: '6px',
        color: activeDesk === desk ? '#fff' : C.muted,
        padding: isMobile ? '5px 10px' : '5px 14px',
        fontSize: isMobile ? '12px' : '13px',
        fontWeight: 700,
        cursor: 'pointer',
        letterSpacing: '0.01em',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap' as const,
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, color: C.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace", overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: isMobile ? '8px 12px' : '10px 20px', flexShrink: 0 }}>
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                {deskBtn('options', 'Options')}
                {tradingDeskEnabled && deskBtn('trading', 'Trading')}
              </div>
              {activeDesk === 'options' && <>
                <input
                  style={{ flex: 1, background: C.input, border: `1px solid #3a3f5c`, borderRadius: '6px', color: C.text, padding: '6px 10px', fontSize: '14px', textTransform: 'uppercase', outline: 'none' }}
                  value={inputSymbol}
                  onChange={e => { setInputSymbol(e.target.value.toUpperCase()); handleInputChange(e.target.value) }}
                  onKeyDown={handleKeyDown}
                  placeholder="Symbol"
                />
                <button onClick={handleSearch} style={{ background: C.accent, border: 'none', borderRadius: '6px', color: '#fff', padding: '6px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Go</button>
              </>}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: 'auto' }}>
                {profilePicUrl
                  ? <img src={profilePicUrl} alt="avatar" style={{ width: '26px', height: '26px', borderRadius: '50%', border: `2px solid ${C.accent}` }} />
                  : <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff' }}>{initials}</div>
                }
                <button onClick={() => setShowSettings(true)} style={{ background: 'transparent', border: `1px solid #3a3f5c`, borderRadius: '6px', color: C.muted, padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>Settings</button>
                <button onClick={signOut} style={{ background: 'transparent', border: `1px solid #3a3f5c`, borderRadius: '6px', color: C.muted, padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>Out</button>
              </div>
            </div>
            {activeDesk === 'options' && <QuoteBar symbol={symbol} />}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '3px' }}>
              {deskBtn('options', '⬡ Options Compass')}
              {tradingDeskEnabled && deskBtn('trading', '◈ Trading Desk')}
            </div>

            {activeDesk === 'options' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    style={{ background: C.input, border: `1px solid #3a3f5c`, borderRadius: '6px', color: C.text, padding: '6px 12px', fontSize: '14px', width: '120px', textTransform: 'uppercase', outline: 'none' }}
                    value={inputSymbol}
                    onChange={e => { setInputSymbol(e.target.value.toUpperCase()); handleInputChange(e.target.value) }}
                    onKeyDown={handleKeyDown}
                    placeholder="Symbol"
                  />
                  <button onClick={handleSearch} style={{ background: C.accent, border: 'none', borderRadius: '6px', color: '#fff', padding: '6px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Go</button>
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}><QuoteBar symbol={symbol} /></div>
              </>
            )}

            {activeDesk === 'trading' && <div style={{ flex: 1 }} />}

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
              {profilePicUrl
                ? <img src={profilePicUrl} alt="avatar" style={{ width: '28px', height: '28px', borderRadius: '50%', border: `2px solid ${C.accent}`, objectFit: 'cover' }} />
                : <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{initials}</div>
              }
              {!isTablet && <span style={{ fontSize: '12px', color: C.muted, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</span>}
              <button onClick={() => setShowFaq(true)} style={{ background: 'transparent', border: `1px solid #3a3f5c`, borderRadius: '6px', color: C.muted, padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>FAQ</button>
              <button onClick={() => setShowSettings(true)} style={{ background: 'transparent', border: `1px solid #3a3f5c`, borderRadius: '6px', color: C.muted, padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>Settings</button>
              <button onClick={signOut} style={{ background: 'transparent', border: `1px solid #3a3f5c`, borderRadius: '6px', color: C.muted, padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>Sign Out</button>
            </div>
          </div>
        )}
      </div>

      {/* Trading Desk workspace */}
      <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '10px' : '16px', display: activeDesk === 'trading' ? 'block' : 'none' }}>
        {features?.trading_desk === false ? (
          <LockedTabPlaceholder requiredTier="pro" onUpgradeClick={handleUpgradeClick} />
        ) : (
          <TradingDesk />
        )}
      </div>

      {/* Options Compass workspace */}
      <div style={{ display: activeDesk === 'options' ? 'flex' : 'none', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>

        {/* Payment failed banner */}
        {paymentFailed && (
          <div style={{ padding: isMobile ? '8px 12px' : '8px 16px', flexShrink: 0 }}>
            <PaymentFailedBanner paymentFailed={paymentFailed} onUpdateCard={handleUpdateCard} />
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

            {/* Tab bar */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', padding: isMobile ? '6px 8px 0' : '8px 16px 0', background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}>
              {visibleTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  style={{
                    padding: isMobile ? '7px 12px' : '8px 20px',
                    fontSize: isMobile ? '12px' : '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    background: activeTab === tab.key ? C.bg : 'transparent',
                    color: activeTab === tab.key ? C.accent : tab.locked ? '#475569' : C.muted,
                    borderRadius: '6px 6px 0 0',
                    borderTop: activeTab === tab.key ? `2px solid ${C.accent}` : '2px solid transparent',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap' as const,
                    flexShrink: 0,
                  }}
                >
                  {isMobile ? tab.short : tab.label}
                  {tab.locked && <span style={{ marginLeft: '4px', fontSize: '10px' }}>🔒</span>}
                </button>
              ))}
              {/* Data-source pill — right-aligned in the tab bar, always visible */}
              {chainDataSource && (
                <div style={{ marginLeft: 'auto', paddingBottom: '6px', flexShrink: 0 }}>
                  {chainDataSource.unavailable ? (
                    <span
                      title="Options chain data is unavailable — yfinance returned no contracts. Try refreshing."
                      style={{ display: 'inline-flex', alignItems: 'center', background: '#1c1917', border: '1px solid #57534e', borderRadius: '999px', padding: '2px 10px', fontSize: '11px', color: '#a8a29e', fontWeight: 600, cursor: 'default', userSelect: 'none' }}
                    >
                      Chain unavailable
                    </span>
                  ) : chainDataSource.synthetic ? (
                    <span
                      title="yfinance returned no data — all prices are theoretical Black-Scholes estimates. Verify in your broker before trading."
                      style={{ display: 'inline-flex', alignItems: 'center', background: '#431407', border: '1px solid #c2410c', borderRadius: '999px', padding: '2px 10px', fontSize: '11px', color: '#fb923c', fontWeight: 600, cursor: 'default', userSelect: 'none' }}
                    >
                      ⚠ Synthetic · BS model
                    </span>
                  ) : (
                    <span
                      title="Quote from yfinance (refreshes every 30s). Options chain bid/ask delayed ~15 min. Some illiquid contracts show modelled prices (marked with ~ in the chain)."
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#052e16', border: '1px solid #166534', borderRadius: '999px', padding: '2px 10px', fontSize: '11px', color: '#4ade80', fontWeight: 600, cursor: 'default', userSelect: 'none' }}
                    >
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'currentColor', display: 'inline-block', flexShrink: 0 }} />
                      Yahoo Finance · options ~15m delayed
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: activeTab === 'chain' ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column', padding: isMobile ? '10px' : '16px' }}>
              <div style={{ display: activeTab === 'chain' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
                <OptionsChain symbol={symbol} onDataSource={setChainDataSource} />
              </div>
              <div style={{ display: activeTab === 'positions' ? 'block' : 'none' }}>
                {features?.positions === false ? (
                  <LockedTabPlaceholder requiredTier="starter" onUpgradeClick={handleUpgradeClick} />
                ) : (
                  <>
                    <Positions key={positionsRefresh} />
                    <PnLChart />
                    <RiskMonitor key={positionsRefresh} />
                  </>
                )}
              </div>
              <div style={{ display: activeTab === 'scanner' ? 'block' : 'none' }}>
                <StrategyScanner
                  onSelectTrade={handleSelectTrade}
                  onMethodologyClick={() => handleTabChange('methodology')}
                />
              </div>
              <div style={{ display: activeTab === 'methodology' ? 'block' : 'none' }}>
                <StrategyMethodologyPage onTabChange={(tab) => handleTabChange(tab as Tab)} />
              </div>
              <div style={{ display: activeTab === 'guide' ? 'block' : 'none' }}>
                <UserGuide isAdmin={false} />
              </div>
              <div style={{ display: activeTab === 'ai' ? 'block' : 'none' }}>
                <AISettings />
              </div>
            </div>
          </div>

          {/* Desktop sidebar */}
          {showSidebar && selectedTrade && (
            <div style={{ width: '360px', flexShrink: 0, background: C.surface, borderLeft: `1px solid ${C.border}`, overflow: 'auto' }}>
              <TradePanel
                symbol={selectedTrade.symbol}
                trade={selectedTrade.trade}
                onRecorded={handleTradeRecorded}
                onClose={() => setSelectedTrade(null)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Mobile: floating button + bottom drawer when a trade is selected */}
      {isMobile && activeDesk === 'options' && selectedTrade && (
        <>
          {!tradePanelOpen && (
            <button
              onClick={() => setTradePanelOpen(true)}
              style={{
                position: 'fixed', bottom: '20px', right: '20px',
                background: C.accent, border: 'none', borderRadius: '28px',
                color: '#fff', padding: '14px 22px', fontSize: '14px', fontWeight: 700,
                cursor: 'pointer', boxShadow: '0 4px 20px rgba(124,106,247,0.5)',
                zIndex: 100, display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              <span style={{ fontSize: '18px' }}>+</span> Record Trade
            </button>
          )}
          {tradePanelOpen && (
            <>
              <div onClick={() => setTradePanelOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200 }} />
              <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `2px solid ${C.accent}`, borderRadius: '16px 16px 0 0', zIndex: 201, maxHeight: '85vh', overflowY: 'auto' }}>
                <TradePanel
                  symbol={selectedTrade.symbol}
                  trade={selectedTrade.trade}
                  onRecorded={handleTradeRecorded}
                  onClose={() => setTradePanelOpen(false)}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

const ADMIN_EMAIL = 'leonardsim.sm@gmail.com'

function ClientAppInner() {
  const { user, profile, loading, pendingLegalAcknowledgment } = useAuth()
  const [authView, setAuthView] = useState<'home' | 'signin' | 'signup'>('home')

  // Start fetching the chain immediately on mount — runs during the auth loading
  // spinner so data is cached by the time the options chain tab renders.
  // Uses the last known first-scanner symbol (persisted in localStorage); falls back to SPY.
  // The chain endpoint has optional auth so this works before the session check completes.
  useEffect(() => {
    const sym = localStorage.getItem(_LAST_SYMBOL_KEY) || 'QQQ'
    getOptionsChain(sym).catch(() => {})
    getQuote(sym).catch(() => {})
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f1117', color: '#7c6af7', fontSize: '16px', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace" }}>
        <span>Loading Options Compass...</span>
      </div>
    )
  }
  if (!user) {
    if (authView === 'signup') {
      return (
        <LoginPage
          initialMode="signup"
          onBack={() => setAuthView('home')}
        />
      )
    }
    return (
      <>
        <HomePage
          onSignIn={() => setAuthView('signin')}
          onSignUp={() => setAuthView('signup')}
        />
        {authView === 'signin' && (
          <SignInModal onClose={() => setAuthView('home')} />
        )}
      </>
    )
  }

  // Onboarding routing
  const loginProfile = profile as { onboarding_completed?: boolean; onboarding_step?: string } | null
  const currentPath = window.location.pathname

  // If user has completed onboarding but landed on /onboarding/complete (Stripe return),
  // treat as complete and clean URL — let dashboard load.
  const isOnboardingPath = currentPath.startsWith('/onboarding/')

  if (loginProfile && loginProfile.onboarding_completed === false) {
    let step: 'plan_selection' | 'legal_acknowledgment' | 'payment' | 'complete' = (loginProfile.onboarding_step || 'plan_selection') as 'plan_selection' | 'legal_acknowledgment' | 'payment' | 'complete'
    if (step === 'complete') step = 'plan_selection'
    // Let OnboardingFlow handle the /onboarding/complete path detection
    return (
      <OnboardingFlow
        initialStep={step}
        onComplete={() => window.location.reload()}
      />
    )
  }

  // Clean up any /onboarding/* paths for users who have already completed onboarding
  if (isOnboardingPath) {
    window.history.replaceState({}, '', '/')
  }

  const showLegalGate = pendingLegalAcknowledgment && user.email !== ADMIN_EMAIL

  return (
    <EntitlementsProvider>
      <Dashboard />
      {showLegalGate && <LegalAcknowledgmentGate />}
    </EntitlementsProvider>
  )
}

function ClientApp() {
  return (
    <AuthProvider>
      <ClientAppInner />
    </AuthProvider>
  )
}

function App() {
  if (PORTAL_MODE === 'admin') {
    return <AdminApp />
  }
  return <ClientApp />
}

export default App
