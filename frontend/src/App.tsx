import React, { useState, useCallback } from 'react'
import QuoteBar from './components/QuoteBar'
import OptionsChain from './components/OptionsChain'
import OrderEntry from './components/OrderEntry'
import Positions from './components/Positions'
import Orders from './components/Orders'

type Tab = 'chain' | 'positions' | 'orders'

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
}

function App() {
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
      </div>

      <div style={styles.body}>
        <div style={styles.main}>
          <div style={styles.tabBar}>
            {(['chain', 'positions', 'orders'] as Tab[]).map(tab => (
              <button
                key={tab}
                style={styles.tab(activeTab === tab)}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'chain' ? 'Options Chain' : tab === 'positions' ? 'Positions' : 'Orders'}
              </button>
            ))}
          </div>
          <div style={styles.tabContent}>
            {activeTab === 'chain' && (
              <OptionsChain
                symbol={symbol}
                onRowClick={handleRowClick}
              />
            )}
            {activeTab === 'positions' && (
              <Positions key={orderRefresh} />
            )}
            {activeTab === 'orders' && (
              <Orders key={orderRefresh} />
            )}
          </div>
        </div>

        <div style={styles.sidebar}>
          <OrderEntry
            prefill={orderPrefill}
            onOrderPlaced={handleOrderPlaced}
          />
        </div>
      </div>
    </div>
  )
}

export default App
