import React, { useState, useCallback } from 'react'
import QuoteBar from './components/QuoteBar'
import OptionsChain from './components/OptionsChain'
import OrderEntry from './components/OrderEntry'
import Positions from './components/Positions'
import Orders from './components/Orders'
import StrategyScanner from './components/StrategyScanner'
import LoginPage from './components/LoginPage'
import AdminPanel from './components/AdminPanel'
import PnLChart from './components/PnLChart'
import { AuthProvider, useAuth } from './context/AuthContext'
import api from './api/client'

type Tab = 'chain' | 'positions' | 'orders' | 'scanner' | 'admin'

export interface OrderPrefill {
  symbol: string
  expiry: string
  strike: number
  option_type: 'call' | 'put'
  bid: number
  ask: number
}

const styles = {
  app: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    background: '#0f1117',
    color: '#e2e8f0',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace",
    overflow: 'hidden',
  },
  header: {
    background: '#1a1d27',
    borderBottom: '1px solid #2d3148',
    padding: '10px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    flexShrink: 0,
  },
  logo: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#7c6af7',
    letterSpacing: '-0.5px',
    whiteSpace: 'nowrap' as const,
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  searchInput: {
    background: '#252836',
    border: '1px solid #3a3f5c',
    borderRadius: '6px',
    color: '#e2e8f0',
    padding: '6px 12px',
    fontSize: '14px',
    width: '120px',
    textTransform: 'uppercase' as const,
    outline: 'none',
  },
  searchBtn: {
    background: '#7c6af7',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  quoteBarWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  userArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  avatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: '2px solid #7c6af7',
    objectFit: 'cover' as const,
  },
  avatarFallback: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    background: '#7c6af7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  },
  userEmail: {
    fontSize: '12px',
    color: '#94a3b8',
    maxWidth: '160px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  signOutBtn: {
    background: 'transparent',
    border: '1px solid #3a3f5c',
    borderRadius: '6px',
    color: '#94a3b8',
    padding: '4px 10px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    minWidth: 0,
  },
  tabBar: {
    display: 'flex',
    gap: '2px',
    padding: '8px 16px 0',
    background: '#1a1d27',
    borderBottom: '1px solid #2d3148',
    flexShrink: 0,
  },
  tab: (active: boolean) => ({
    padding: '8px 20px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    background: active ? '#0f1117' : 'transparent',
    color: active ? '#7c6af7' : '#94a3b8',
    borderRadius: '6px 6px 0 0',
    borderTop: active ? '2px solid #7c6af7' : '2px solid transparent',
    transition: 'all 0.15s',
  }),
  tabContent: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
  },
  sidebar: {
    width: '300px',
    flexShrink: 0,
    background: '#1a1d27',
    borderLeft: '1px solid #2d3148',
    overflow: 'auto',
  },
  spinner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#0f1117',
    color: '#7c6af7',
    fontSize: '16px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace",
  },
}

function Dashboard() {
  const { user, profile, isAdmin, signOut } = useAuth()
  const [symbol, setSymbol] = useState('SPY')
  const [inputSymbol, setInputSymbol] = useState('SPY')
  const [activeTab, setActiveTab] = useState<Tab>('chain')
  const [orderPrefill, setOrderPrefill] = useState<OrderPrefill | null>(null)
  const [orderRefresh, setOrderRefresh] = useState(0)

  const handleSearch = useCallback(() => {
    const s = inputSymbol.trim().toUpperCase()
    if (s) setSymbol(s)
  }, [inputSymbol])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleRowClick = useCallback((prefill: OrderPrefill) => {
    setOrderPrefill(prefill)
  }, [])

  const handleOrderPlaced = useCallback(() => {
    setOrderRefresh(n => n + 1)
  }, [])

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab)
    if (tab === 'positions') {
      // Record today's portfolio snapshot when user views positions
      api.post('/positions/snapshot').catch(() => {})
    }
  }, [])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'chain', label: 'Options Chain' },
    { key: 'positions', label: 'Positions' },
    { key: 'orders', label: 'Orders' },
    { key: 'scanner', label: 'Strategy Scanner' },
    ...(isAdmin ? [{ key: 'admin' as Tab, label: 'Admin' }] : []),
  ]

  const initials = (profile?.full_name || user?.email || '?')
    .split(' ')
    .map((p: string) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div style={styles.app}>
      <div style={styles.header}>
        <div style={styles.logo}>⬡ OptionsDesk</div>
        <div style={styles.searchWrap}>
          <input
            style={styles.searchInput}
            value={inputSymbol}
            onChange={e => setInputSymbol(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="Symbol"
          />
          <button style={styles.searchBtn} onClick={handleSearch}>Go</button>
        </div>
        <div style={styles.quoteBarWrap}>
          <QuoteBar symbol={symbol} />
        </div>

        {/* User area */}
        <div style={styles.userArea}>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="avatar" style={styles.avatar} />
          ) : (
            <div style={styles.avatarFallback}>{initials}</div>
          )}
          <span style={styles.userEmail}>{user?.email}</span>
          <button style={styles.signOutBtn} onClick={signOut}>Sign Out</button>
        </div>
      </div>

      <div style={styles.body}>
        <div style={styles.main}>
          <div style={styles.tabBar}>
            {tabs.map(tab => (
              <button
                key={tab.key}
                style={styles.tab(activeTab === tab.key)}
                onClick={() => handleTabChange(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div style={styles.tabContent}>
            {activeTab === 'chain' && (
              <OptionsChain symbol={symbol} onRowClick={handleRowClick} />
            )}
            {activeTab === 'positions' && (
              <>
                <Positions key={orderRefresh} />
                <PnLChart />
              </>
            )}
            {activeTab === 'orders' && (
              <Orders key={orderRefresh} />
            )}
            {activeTab === 'scanner' && (
              <StrategyScanner onAddToOrder={handleRowClick} />
            )}
            {activeTab === 'admin' && isAdmin && (
              <AdminPanel />
            )}
          </div>
        </div>

        {activeTab !== 'admin' && (
          <div style={styles.sidebar}>
            <OrderEntry prefill={orderPrefill} onOrderPlaced={handleOrderPlaced} />
          </div>
        )}
      </div>
    </div>
  )
}

function AppInner() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={styles.spinner}>
        <span>Loading OptionsDesk…</span>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

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
