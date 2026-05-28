import { useEffect, useState } from 'react'
import { getPositions, getPortfolio, Position, PortfolioSummary } from '../api/client'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

const C = {
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#64748b',
  green: '#22c55e',
  red: '#ef4444',
  accent: '#7c6af7',
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  summaryRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: '8px',
    padding: '14px 18px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    minWidth: '140px',
  },
  cardLabel: {
    fontSize: '11px',
    color: C.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    fontWeight: 600,
  },
  cardValue: {
    fontSize: '20px',
    fontWeight: 700,
    color: C.text,
    fontVariantNumeric: 'tabular-nums',
  },
  tableWrap: { overflowX: 'auto' as const },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
    fontVariantNumeric: 'tabular-nums',
  },
  th: {
    padding: '9px 12px',
    textAlign: 'right' as const,
    color: C.muted,
    fontWeight: 600,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: 'nowrap' as const,
    background: C.surface,
  },
  thLeft: {
    padding: '9px 12px',
    textAlign: 'left' as const,
    color: C.muted,
    fontWeight: 600,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: 'nowrap' as const,
    background: C.surface,
  },
  td: {
    padding: '8px 12px',
    textAlign: 'right' as const,
    color: C.text,
    borderBottom: `1px solid ${C.border}22`,
    whiteSpace: 'nowrap' as const,
  },
  tdLeft: {
    padding: '8px 12px',
    textAlign: 'left' as const,
    color: C.text,
    borderBottom: `1px solid ${C.border}22`,
    whiteSpace: 'nowrap' as const,
  },
  badge: (type: 'call' | 'put') => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
    background: type === 'call' ? '#0d1a2d' : '#2d1a2d',
    color: type === 'call' ? '#3b82f6' : '#a855f7',
    border: `1px solid ${type === 'call' ? '#3b82f6' : '#a855f7'}40`,
  }),
  empty: {
    textAlign: 'center' as const,
    color: C.muted,
    padding: '40px',
    fontSize: '14px',
  },
  loading: { color: C.muted, fontSize: '13px', padding: '20px 0' },
}

export default function Positions() {
  const [positions, setPositions] = useState<Position[]>([])
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getPositions(), getPortfolio()])
      .then(([pos, sum]) => {
        setPositions(pos)
        setSummary(sum)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={styles.loading}>Loading positions...</div>

  const totalPnl = positions.reduce((acc, p) => acc + p.pnl, 0)
  const totalDelta = positions.reduce((acc, p) => acc + p.delta * p.quantity * 100, 0)

  return (
    <div style={styles.wrap}>
      <div style={styles.summaryRow}>
        <div style={styles.card}>
          <span style={styles.cardLabel}>Cash Balance</span>
          <span style={styles.cardValue}>${fmt(summary?.cash ?? 0)}</span>
        </div>
        <div style={styles.card}>
          <span style={styles.cardLabel}>Positions Value</span>
          <span style={styles.cardValue}>${fmt(summary?.positions_value ?? 0)}</span>
        </div>
        <div style={styles.card}>
          <span style={styles.cardLabel}>Total Value</span>
          <span style={styles.cardValue}>${fmt(summary?.total_value ?? 0)}</span>
        </div>
        <div style={styles.card}>
          <span style={styles.cardLabel}>Unrealized P&L</span>
          <span style={{
            ...styles.cardValue,
            color: totalPnl >= 0 ? C.green : C.red,
          }}>
            {totalPnl >= 0 ? '+' : ''}${fmt(totalPnl)}
          </span>
        </div>
        <div style={styles.card}>
          <span style={styles.cardLabel}>Net Delta</span>
          <span style={styles.cardValue}>{fmt(totalDelta, 1)}</span>
        </div>
      </div>

      {positions.length === 0 ? (
        <div style={styles.empty}>No open positions. Place an order to get started.</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.thLeft}>Symbol</th>
                <th style={styles.th}>Expiry</th>
                <th style={styles.th}>Strike</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Qty</th>
                <th style={styles.th}>Avg Cost</th>
                <th style={styles.th}>Current</th>
                <th style={styles.th}>P&L</th>
                <th style={styles.th}>P&L %</th>
                <th style={styles.th}>Delta</th>
                <th style={styles.th}>Gamma</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, i) => {
                const pnlPct = pos.avg_cost > 0
                  ? ((pos.current_price - pos.avg_cost) / pos.avg_cost * 100)
                  : 0
                const pnlColor = pos.pnl >= 0 ? C.green : C.red
                return (
                  <tr key={i}>
                    <td style={{ ...styles.tdLeft, fontWeight: 700, color: C.accent }}>
                      {pos.symbol}
                    </td>
                    <td style={styles.td}>{pos.expiry}</td>
                    <td style={styles.td}>${fmt(pos.strike)}</td>
                    <td style={{ ...styles.td }}>
                      <span style={styles.badge(pos.option_type as 'call' | 'put')}>
                        {pos.option_type.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ ...styles.td, color: pos.quantity < 0 ? C.red : C.text }}>
                      {pos.quantity > 0 ? '+' : ''}{pos.quantity}
                    </td>
                    <td style={styles.td}>${fmt(pos.avg_cost)}</td>
                    <td style={styles.td}>${fmt(pos.current_price)}</td>
                    <td style={{ ...styles.td, color: pnlColor, fontWeight: 600 }}>
                      {pos.pnl >= 0 ? '+' : ''}${fmt(pos.pnl)}
                    </td>
                    <td style={{ ...styles.td, color: pnlColor }}>
                      {pnlPct >= 0 ? '+' : ''}{fmt(pnlPct)}%
                    </td>
                    <td style={styles.td}>{fmt(pos.delta, 3)}</td>
                    <td style={styles.td}>{fmt(pos.gamma, 4)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
