import React, { useState, useCallback } from 'react'
import QuoteBar from './components/QuoteBar'
import OptionsChain from './components/OptionsChain'
import TradePanel from './components/TradePanel'
import Positions from './components/Positions'
import StrategyScanner from './components/StrategyScanner'
import LoginPage from './components/LoginPage'
import AdminPanel from './components/AdminPanel'
import PnLChart from './components/PnLChart'
import RiskMonitor from './components/RiskMonitor'
import UserGuide from './components/UserGuide'
import TradingDesk from './components/TradingDesk'
import AISettings from './components/AISettings'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useWindowSize } from './hooks/useWindowSize'
import { TradeStructure } from './api/client'
import api from './api/client'

type Desk = 'options' | 'trading'
type Tab = 'chain' | 'positions' | 'scanner' | 'admin' | 'guide' | 'ai'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
  input: '#252836',
}

function Dashboard() {
  const { user, profile, isAdmin, signOut } = useAuth()
  const { isMobile, isTablet } = useWindowSize()
  const [activeDesk, setActiveDesk] = useState<Desk>('options')
  const [symbol, setSymbol] = useState('SPY')
  const [inputSymbol, setInputSymbol] = useState('SPY')
  const [activeTab, setActiveTab] = useState<Tab>('chain')
  const [selectedTrade, setSelectedTrade] = useState<{ symbol: string; trade: TradeStructure } | null>(null)
  const [positionsRefresh, setPositionsRefresh] = useState(0)
  const [tradePanelOpen, setTradePanelOpen] = useState(false)

  const handleSearch = useCallback(() => {
    const s = inputSymbol.trim().toUpperCase()
    if (s) setSymbol(s)
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

  const tabs: { key: Tab; label: string; short: string }[] = [
    { key: 'chain', label: 'Options Chain', short: 'Chain' },
    { key: 'positions', label: 'Positions', short: 'P&L' },
    { key: 'scanner', label: 'Strategy Scanner', short: 'Scanner' },
    { key: 'ai', label: 'AI Features', short: 'AI' },
    { key: 'guide', label: 'User Guide', short: 'Guide' },
    ...(isAdmin ? [{ key: 'admin' as Tab, label: 'Admin', short: 'Admin' }] : []),
  ]

  const initials = (profile?.full_name || user?.email || '?')
    .split(' ')
    .map((p: string) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const showSidebar = !!selectedTrade && !isMobile && activeDesk === 'options' && activeTab !== 'admin' && activeTab !== 'guide'

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
        whiteSpace: 'nowrap',
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
                {deskBtn('trading', 'Trading')}
              </div>
              {activeDesk === 'options' && <>
                <input
                  style={{ flex: 1, background: C.input, border: `1px solid #3a3f5c`, borderRadius: '6px', color: C.text, padding: '6px 10px', fontSize: '14px', textTransform: 'uppercase', outline: 'none' }}
                  value={inputSymbol}
                  onChange={e => setInputSymbol(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  placeholder="Symbol"
                />
                <button onClick={handleSearch} style={{ background: C.accent, border: 'none', borderRadius: '6px', color: '#fff', padding: '6px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Go</button>
              </>}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: 'auto' }}>
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="avatar" style={{ width: '26px', height: '26px', borderRadius: '50%', border: `2px solid ${C.accent}` }} />
                  : <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff' }}>{initials}</div>
                }
                <button onClick={signOut} style={{ background: 'transparent', border: `1px solid #3a3f5c`, borderRadius: '6px', color: C.muted, padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>Out</button>
              </div>
            </div>
            {activeDesk === 'options' && <QuoteBar symbol={symbol} />}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '3px' }}>
              {deskBtn('options', '⬡ Options Desk')}
              {deskBtn('trading', '◈ Trading Desk')}
            </div>

            {activeDesk === 'options' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    style={{ background: C.input, border: `1px solid #3a3f5c`, borderRadius: '6px', color: C.text, padding: '6px 12px', fontSize: '14px', width: '120px', textTransform: 'uppercase', outline: 'none' }}
                    value={inputSymbol}
                    onChange={e => setInputSymbol(e.target.value.toUpperCase())}
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
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="avatar" style={{ width: '28px', height: '28px', borderRadius: '50%', border: `2px solid ${C.accent}`, objectFit: 'cover' }} />
                : <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{initials}</div>
              }
              {!isTablet && <span style={{ fontSize: '12px', color: C.muted, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</span>}
              <button onClick={signOut} style={{ background: 'transparent', border: `1px solid #3a3f5c`, borderRadius: '6px', color: C.muted, padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>Sign Out</button>
            </div>
          </div>
        )}
      </div>

      {/* Trading Desk workspace */}
      <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '10px' : '16px', display: activeDesk === 'trading' ? 'block' : 'none' }}>
        <TradingDesk />
      </div>

      {/* Options Desk workspace */}
      <div style={{ display: activeDesk === 'options' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: '2px', padding: isMobile ? '6px 8px 0' : '8px 16px 0', background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
              {tabs.map(tab => (
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
                    color: activeTab === tab.key ? C.accent : C.muted,
                    borderRadius: '6px 6px 0 0',
                    borderTop: activeTab === tab.key ? `2px solid ${C.accent}` : '2px solid transparent',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {isMobile ? tab.short : tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '10px' : '16px' }}>
              <div style={{ display: activeTab === 'chain' ? 'block' : 'none' }}>
                <OptionsChain symbol={symbol} />
              </div>
              <div style={{ display: activeTab === 'positions' ? 'block' : 'none' }}>
                <Positions key={positionsRefresh} />
                <PnLChart />
                <RiskMonitor key={positionsRefresh} />
              </div>
              <div style={{ display: activeTab === 'scanner' ? 'block' : 'none' }}>
                <StrategyScanner onSelectTrade={handleSelectTrade} />
              </div>
              <div style={{ display: activeTab === 'ai' ? 'block' : 'none' }}>
                <AISettings />
              </div>
              <div style={{ display: activeTab === 'guide' ? 'block' : 'none' }}>
                <UserGuide isAdmin={isAdmin} />
              </div>
              {isAdmin && (
                <div style={{ display: activeTab === 'admin' ? 'block' : 'none' }}>
                  <AdminPanel />
                </div>
              )}
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

      {/* Mobile: floating button + bottom drawer when a trade is selected */}
      {isMobile && activeDesk === 'options' && activeTab !== 'admin' && selectedTrade && (
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

function AppInner() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f1117', color: '#7c6af7', fontSize: '16px', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace" }}>
        <span>Loading OptionsDesk…</span>
      </div>
    )
  }
  if (!user) return <LoginPage />
  return <Dashboard />
}

function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}

export default App
