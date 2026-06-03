import { useEffect, useState } from 'react'
import { getPositions, getPortfolio, Position, PortfolioSummary } from '../api/client'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

const C = {
  surface: '#1a1d27',
  surface2: '#252836',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#64748b',
  green: '#22c55e',
  red: '#ef4444',
  amber: '#f59e0b',
  accent: '#7c6af7',
  blue: '#38bdf8',
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

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
      <span style={{
        flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%',
        background: `${C.accent}22`, border: `1px solid ${C.accent}55`,
        color: C.accent, fontSize: '11px', fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</span>
      <span style={{ fontSize: '13px', color: C.text, lineHeight: 1.65 }}>{children}</span>
    </div>
  )
}

function MonitorGuide() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: C.surface, border: 'none', cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>
            📋 How to Monitor &amp; Close Your Trades
          </span>
          <span style={{
            fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
            background: `${C.accent}22`, color: C.accent, textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}>Guide</span>
        </div>
        <span style={{ color: C.muted, fontSize: '16px' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ background: '#0f1117', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* Section 1 — Reading the table */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.blue, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
              Step 1 — Reading Your Position
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ background: C.surface2, borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: C.text, lineHeight: 1.7 }}>
                Each row in the table below is one open trade. The most important columns to watch are:
                <ul style={{ margin: '8px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <li><strong style={{ color: C.text }}>Avg Cost</strong> — the price you paid (or received) when you entered the trade.</li>
                  <li><strong style={{ color: C.text }}>Current</strong> — what that same option is worth right now in the market.</li>
                  <li><strong style={{ color: C.green }}>P&amp;L %</strong> — how much you're up or down as a percentage. This is the number to watch.</li>
                  <li><strong style={{ color: C.amber }}>Target</strong> — the recommended exit level. When P&amp;L % reaches this, it's time to close.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Section 2 — When to close */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.amber, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
              Step 2 — Know When to Close
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
              <div style={{ background: '#0f2d1a', border: `1px solid ${C.green}44`, borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>✅ Take Profit</div>
                <div style={{ fontSize: '13px', color: C.text, lineHeight: 1.65 }}>
                  Close when <strong>P&amp;L % hits +50%</strong> or more. For example: if you paid $200 to enter, close when the position is worth $300 (+$100 profit). Don't be greedy — locking in 50% is the tastylive standard.
                </div>
              </div>
              <div style={{ background: '#2d0f0f', border: `1px solid ${C.red}44`, borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: C.red, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>🛑 Cut Loss</div>
                <div style={{ fontSize: '13px', color: C.text, lineHeight: 1.65 }}>
                  Close when <strong>P&amp;L % reaches −100%</strong> (you've lost what you paid). For credit trades, close if loss equals <strong>2× the premium collected</strong>. Don't wait — small losses are manageable, large ones aren't.
                </div>
              </div>
              <div style={{ background: '#2d1f0a', border: `1px solid ${C.amber}44`, borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: C.amber, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>⏰ Time Rule</div>
                <div style={{ fontSize: '13px', color: C.text, lineHeight: 1.65 }}>
                  Close <strong>any trade with 21 days or fewer until expiry</strong>, regardless of P&amp;L. Options decay fastest in the last 3 weeks — staying in adds risk without much reward.
                </div>
              </div>
            </div>
          </div>

          {/* Section 3 — How to close */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
              Step 3 — How to Close the Trade (step by step)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Step n={1}>
                Look at the row you want to close. Write down the <strong>Symbol</strong>, <strong>Expiry</strong>, <strong>Strike</strong>, <strong>Type</strong> (Call or Put), and <strong>Qty</strong>.
              </Step>
              <Step n={2}>
                Go to the <strong>Order Entry</strong> panel on the right side of the screen. On mobile, tap the <strong>"+ Place Order"</strong> button at the bottom.
              </Step>
              <Step n={3}>
                Fill in the same <strong>Symbol</strong>, <strong>Expiry</strong>, <strong>Strike</strong>, and <strong>Type</strong> you just wrote down.
              </Step>
              <Step n={4}>
                <strong>Flip the Action to the opposite of what you originally did:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <li>If your Qty shows <strong style={{ color: C.green }}>+1</strong> (you bought it) → set Action to <strong>Sell</strong></li>
                  <li>If your Qty shows <strong style={{ color: C.red }}>−1</strong> (you sold it short) → set Action to <strong>Buy</strong></li>
                </ul>
              </Step>
              <Step n={5}>
                Set <strong>Quantity</strong> to the same number shown in the Qty column.
              </Step>
              <Step n={6}>
                Click the <strong>Sell</strong> (or Buy) button and confirm. The position will disappear from this table and your cash balance will update.
              </Step>
            </div>
            <div style={{
              marginTop: '10px', background: `${C.accent}11`, border: `1px solid ${C.accent}33`,
              borderRadius: '6px', padding: '10px 14px', fontSize: '13px', color: C.text, lineHeight: 1.7,
            }}>
              <strong style={{ color: C.accent }}>Tip:</strong> Refresh this tab after placing the close order to confirm the position is gone and your P&amp;L has been realised.
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

function ProfitBar({ pnlPct, targetPct }: { pnlPct: number; targetPct: number }) {
  const progress = Math.min(Math.max(pnlPct / targetPct, 0), 1)
  const isProfit = pnlPct >= 0
  const hitTarget = pnlPct >= targetPct
  const barColor = hitTarget ? C.green : isProfit ? C.accent : C.red

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', minWidth: '90px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: hitTarget ? C.green : C.muted }}>
        {hitTarget ? '✅ Close Now' : `${fmt(pnlPct)}% / ${targetPct}%`}
      </div>
      <div style={{ width: '80px', height: '5px', background: '#2d3148', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.abs(progress) * 100}%`,
          height: '100%',
          background: barColor,
          borderRadius: '3px',
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
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
      <MonitorGuide />

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
                <th style={styles.th}>Target</th>
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
                const targetPct = 50
                const hitTarget = pnlPct >= targetPct
                const rowBg = hitTarget ? `${C.green}08` : undefined
                return (
                  <tr key={i} style={rowBg ? { background: rowBg } : undefined}>
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
                    <td style={{ ...styles.td, color: pnlColor, fontWeight: 700 }}>
                      {pnlPct >= 0 ? '+' : ''}{fmt(pnlPct)}%
                    </td>
                    <td style={styles.td}>
                      <ProfitBar pnlPct={pnlPct} targetPct={targetPct} />
                    </td>
                    <td style={styles.td}>{fmt(pos.delta, 3)}</td>
                    <td style={styles.td}>{fmt(pos.gamma, 4)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ marginTop: '10px', fontSize: '11px', color: C.muted, textAlign: 'right' }}>
            Target = +50% profit (tastylive standard). Rows highlight green when target is reached. Click the tab to refresh prices.
          </div>
        </div>
      )}
    </div>
  )
}
