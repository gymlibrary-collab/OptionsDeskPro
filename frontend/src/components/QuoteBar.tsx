import { useEffect, useState, useRef } from 'react'
import { getQuote, Quote } from '../api/client'

interface Props {
  symbol: string
  dataSource?: { synthetic: boolean; estimatedPct: number } | null
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtBig(n: number) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  return n.toLocaleString()
}

const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    overflow: 'hidden',
  },
  symbol: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#e2e8f0',
    letterSpacing: '0.05em',
  },
  price: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#e2e8f0',
    fontVariantNumeric: 'tabular-nums',
  },
  changePos: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#22c55e',
  },
  changeNeg: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#ef4444',
  },
  meta: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  metaLabel: {
    fontSize: '10px',
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  metaValue: {
    fontSize: '13px',
    color: '#94a3b8',
    fontVariantNumeric: 'tabular-nums',
  },
  loading: {
    fontSize: '13px',
    color: '#64748b',
    fontStyle: 'italic',
  },
  dot: (up: boolean | null) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: up === null ? '#64748b' : up ? '#22c55e' : '#ef4444',
    display: 'inline-block',
    marginRight: '6px',
    boxShadow: up === null ? 'none' : up ? '0 0 6px #22c55e80' : '0 0 6px #ef444480',
  }),
}

export default function QuoteBar({ symbol, dataSource }: Props) {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<number | null>(null)

  const fetchQuote = async () => {
    try {
      const q = await getQuote(symbol)
      setQuote(q)
    } catch {
      // keep last data
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    setQuote(null)
    fetchQuote()
    intervalRef.current = window.setInterval(fetchQuote, 30000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [symbol])

  if (loading) return <div style={styles.loading}>Loading {symbol}...</div>
  if (!quote || quote.price === 0) return <div style={styles.loading}>No data for {symbol}</div>

  const up = quote.change >= 0

  return (
    <div style={styles.bar}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={styles.dot(up)} />
        <span style={styles.symbol}>{quote.symbol}</span>
      </div>
      <span style={styles.price}>${fmt(quote.price)}</span>
      <span style={up ? styles.changePos : styles.changeNeg}>
        {up ? '+' : ''}{fmt(quote.change)} ({up ? '+' : ''}{fmt(quote.changePercent)}%)
      </span>
      <div style={styles.meta}>
        <span style={styles.metaLabel}>Prev Close</span>
        <span style={styles.metaValue}>${fmt(quote.previousClose)}</span>
      </div>
      <div style={styles.meta}>
        <span style={styles.metaLabel}>Volume</span>
        <span style={styles.metaValue}>{fmtBig(quote.volume)}</span>
      </div>
      {dataSource && (
        dataSource.synthetic ? (
          <span
            title="yfinance returned no data — all prices are theoretical Black-Scholes estimates. Verify in your broker before trading."
            style={{
              display: 'inline-flex', alignItems: 'center',
              background: '#431407', border: '1px solid #c2410c', borderRadius: '999px',
              padding: '3px 10px', fontSize: '11px', color: '#fb923c', fontWeight: 600,
              cursor: 'default', userSelect: 'none' as const,
            }}
          >
            ⚠ Synthetic · BS model
          </span>
        ) : (
          <span
            title="Quote from yfinance (refreshes every 30s). Options chain bid/ask delayed ~15 min. Some illiquid contracts show modelled prices (marked with ~ in the chain)."
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              background: '#052e16', border: '1px solid #166534',
              borderRadius: '999px',
              padding: '3px 10px', fontSize: '11px',
              color: '#4ade80',
              fontWeight: 600, cursor: 'default', userSelect: 'none' as const,
            }}
          >
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'currentColor', display: 'inline-block', flexShrink: 0 }} />
            yfinance · options ~15m delayed
          </span>
        )
      )}
      {quote.marketCap > 0 && (
        <div style={styles.meta}>
          <span style={styles.metaLabel}>Mkt Cap</span>
          <span style={styles.metaValue}>${fmtBig(quote.marketCap)}</span>
        </div>
      )}
    </div>
  )
}
