import { useEffect, useState, useCallback } from 'react'
import { getPositions, getPortfolio, Position, PortfolioSummary } from '../api/client'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function dte(expiry: string): number {
  try {
    const exp = new Date(expiry + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.max(0, Math.round((exp.getTime() - today.getTime()) / 86400000))
  } catch { return 0 }
}

function pnlPct(pos: Position): number {
  const basis = pos.avg_cost * Math.abs(pos.quantity) * 100
  return basis > 0 ? (pos.pnl / basis) * 100 : 0
}

function profitTarget(pos: Position): number {
  return pos.profit_target_pct ?? 50
}

function stopLoss(pos: Position): number {
  return (pos.entry_action ?? (pos.quantity > 0 ? 'buy' : 'sell')) === 'buy' ? -50 : -200
}

type Alert = { pos: Position; kind: 'profit' | 'stop' | 'dte' }

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
  summaryRow: { display: 'flex', gap: '12px', flexWrap: 'wrap' as const },
  card: {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px',
    padding: '14px 18px', display: 'flex', flexDirection: 'column' as const,
    gap: '4px', minWidth: '140px',
  },
  cardLabel: { fontSize: '11px', color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600 },
  cardValue: { fontSize: '20px', fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' },
  tableWrap: { overflowX: 'auto' as const },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px', fontVariantNumeric: 'tabular-nums' },
  th: { padding: '9px 12px', textAlign: 'right' as const, color: C.muted, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.06em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' as const, background: C.surface },
  thLeft: { padding: '9px 12px', textAlign: 'left' as const, color: C.muted, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.06em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' as const, background: C.surface },
  td: { padding: '8px 12px', textAlign: 'right' as const, color: C.text, borderBottom: `1px solid ${C.border}22`, whiteSpace: 'nowrap' as const },
  tdLeft: { padding: '8px 12px', textAlign: 'left' as const, color: C.text, borderBottom: `1px solid ${C.border}22`, whiteSpace: 'nowrap' as const },
  typeBadge: (type: string) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
    background: type === 'call' ? '#0d1a2d' : '#2d1a2d',
    color: type === 'call' ? '#3b82f6' : '#a855f7',
    border: `1px solid ${type === 'call' ? '#3b82f6' : '#a855f7'}40`,
  }),
  actionBadge: (action: string) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
    background: action === 'buy' ? '#0f2d1a' : '#2d0f0f',
    color: action === 'buy' ? '#22c55e' : '#ef4444',
    border: `1px solid ${action === 'buy' ? '#22c55e' : '#ef4444'}40`,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  }),
  empty: { textAlign: 'center' as const, color: C.muted, padding: '40px', fontSize: '14px' },
  loading: { color: C.muted, fontSize: '13px', padding: '20px 0' },
}

function AlertBanner({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {alerts.map((a, i) => {
        const pct = pnlPct(a.pos)
        const target = profitTarget(a.pos)
        const stop = stopLoss(a.pos)
        const stratLabel = a.pos.strategy_name ? `[${a.pos.strategy_name}] ` : ''
        let bg: string, border: string, icon: string, headline: string, detail: string
        if (a.kind === 'profit') {
          bg = '#0f2d1a'; border = C.green; icon = '✅'
          headline = `TAKE PROFIT — ${a.pos.symbol} ${a.pos.strike} ${a.pos.option_type.toUpperCase()}`
          detail = `${stratLabel}P&L is +${fmt(pct)}% — target was +${target}%. Time to close this position.`
        } else if (a.kind === 'stop') {
          bg = '#2d0f0f'; border = C.red; icon = '🛑'
          headline = `STOP LOSS — ${a.pos.symbol} ${a.pos.strike} ${a.pos.option_type.toUpperCase()}`
          detail = `${stratLabel}P&L is ${fmt(pct)}% — stop is ${stop}%. Close immediately to limit further loss.`
        } else {
          bg = '#2d1f0a'; border = C.amber; icon = '⏰'
          headline = `21-DTE CLOSE — ${a.pos.symbol} ${a.pos.strike} ${a.pos.option_type.toUpperCase()}`
          detail = `${stratLabel}${dte(a.pos.expiry)} days to expiry. tastylive rule: close at 21 DTE regardless of P&L.`
        }
        return (
          <div key={i} style={{ background: bg, border: `1px solid ${border}66`, borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <span style={{ fontSize: '18px', flexShrink: 0 }}>{icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: border, marginBottom: '4px' }}>{headline}</div>
                <div style={{ fontSize: '12px', color: C.text, lineHeight: 1.6, marginBottom: '10px' }}>{detail}</div>
                <div style={{ background: `${border}11`, border: `1px solid ${border}33`, borderRadius: '6px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: border, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>How to close this position</div>
                  <ol style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: C.text, lineHeight: 1.8 }}>
                    <li>Go to <strong>Order Entry</strong> (right sidebar). On mobile tap <strong>"+ Place Order"</strong>.</li>
                    <li>Fill in: Symbol <strong>{a.pos.symbol}</strong> · Expiry <strong>{a.pos.expiry}</strong> · Strike <strong>${fmt(a.pos.strike)}</strong> · Type <strong>{a.pos.option_type.toUpperCase()}</strong></li>
                    <li>Set Action to <strong>{a.pos.quantity > 0 ? 'SELL' : 'BUY'}</strong> (opposite of your entry) · Quantity <strong>{Math.abs(a.pos.quantity)}</strong></li>
                    <li>Click the button and confirm. Hit <strong>↻ Refresh</strong> above to confirm it's gone.</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TargetBar({ pos }: { pos: Position }) {
  const pct = pnlPct(pos)
  const target = profitTarget(pos)
  const stop = stopLoss(pos)
  const hitProfit = pct >= target
  const hitStop = pct <= stop
  const progress = hitProfit ? 1 : Math.max(0, Math.min(pct / target, 1))
  const barColor = hitProfit ? C.green : hitStop ? C.red : pct > 0 ? C.accent : C.red
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', minWidth: '100px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: hitProfit ? C.green : hitStop ? C.red : C.muted }}>
        {hitProfit ? '✅ Close Now' : hitStop ? '🛑 Stop Loss' : `${fmt(pct)}% / ${target}%`}
      </div>
      <div style={{ width: '80px', height: '5px', background: '#2d3148', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${Math.abs(progress) * 100}%`, height: '100%', background: barColor, borderRadius: '3px', transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ fontSize: '10px', color: C.muted }}>target +{target}%</div>
    </div>
  )
}

export default function Positions() {
  const [positions, setPositions] = useState<Position[]>([])
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([getPositions(), getPortfolio()])
      .then(([pos, sum]) => { setPositions(pos); setSummary(sum); setLastRefresh(new Date()) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(load, 120_000)
    return () => clearInterval(id)
  }, [load])

  const totalPnl = positions.reduce((acc, p) => acc + p.pnl, 0)
  const totalDelta = positions.reduce((acc, p) => acc + p.delta * p.quantity * 100, 0)

  const alerts: Alert[] = positions.flatMap(pos => {
    const pct = pnlPct(pos)
    const list: Alert[] = []
    if (pct >= profitTarget(pos)) list.push({ pos, kind: 'profit' })
    else if (pct <= stopLoss(pos)) list.push({ pos, kind: 'stop' })
    if (dte(pos.expiry) <= 21 && dte(pos.expiry) > 0) list.push({ pos, kind: 'dte' })
    return list
  })

  return (
    <div style={styles.wrap}>
      <AlertBanner alerts={alerts} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div style={styles.summaryRow}>
          <div style={styles.card}><span style={styles.cardLabel}>Cash Balance</span><span style={styles.cardValue}>${fmt(summary?.cash ?? 0)}</span></div>
          <div style={styles.card}><span style={styles.cardLabel}>Positions Value</span><span style={styles.cardValue}>${fmt(summary?.positions_value ?? 0)}</span></div>
          <div style={styles.card}><span style={styles.cardLabel}>Total Value</span><span style={styles.cardValue}>${fmt(summary?.total_value ?? 0)}</span></div>
          <div style={styles.card}><span style={styles.cardLabel}>Unrealized P&L</span><span style={{ ...styles.cardValue, color: totalPnl >= 0 ? C.green : C.red }}>{totalPnl >= 0 ? '+' : ''}${fmt(totalPnl)}</span></div>
          <div style={styles.card}><span style={styles.cardLabel}>Net Delta</span><span style={styles.cardValue}>{fmt(totalDelta, 1)}</span></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', marginLeft: 'auto' }}>
          <button onClick={load} disabled={loading} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '6px', color: C.muted, padding: '6px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>{loading ? 'Refreshing…' : '↻ Refresh'}</button>
          <span style={{ fontSize: '10px', color: C.muted }}>Auto-refreshes every 2 min · Last: {lastRefresh.toLocaleTimeString()}</span>
        </div>
      </div>
      {positions.length === 0 ? (
        <div style={styles.empty}>{loading ? 'Loading positions…' : 'No open positions. Run a strategy scan and place a paper trade to start monitoring.'}</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.thLeft}>Symbol</th>
                <th style={styles.thLeft}>Strategy</th>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Expiry</th>
                <th style={styles.th}>DTE</th>
                <th style={styles.th}>Strike</th>
                <th style={styles.th}>Qty</th>
                <th style={styles.th}>Unit Price</th>
                <th style={styles.th}>Total Cost</th>
                <th style={styles.th}>Current</th>
                <th style={styles.th}>P&L $</th>
                <th style={styles.th}>P&L %</th>
                <th style={styles.th}>Target / Progress</th>
                <th style={styles.th}>Delta</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, i) => {
                const pct = pnlPct(pos)
                const target = profitTarget(pos)
                const daysLeft = dte(pos.expiry)
                const pnlColor = pos.pnl >= 0 ? C.green : C.red
                const dteColor = daysLeft <= 7 ? C.red : daysLeft <= 21 ? C.amber : C.muted
                const hitTarget = pct >= target
                const hitStop = pct <= stopLoss(pos)
                const rowBg = hitTarget ? `${C.green}08` : hitStop ? `${C.red}08` : daysLeft <= 21 ? `${C.amber}05` : undefined
                const action = (pos.entry_action ?? (pos.quantity > 0 ? 'buy' : 'sell')).toLowerCase()
                const totalCost = pos.avg_cost * Math.abs(pos.quantity) * 100
                return (
                  <tr key={i} style={rowBg ? { background: rowBg } : undefined}>
                    <td style={{ ...styles.tdLeft, fontWeight: 700, color: C.accent }}>{pos.symbol}</td>
                    <td style={styles.tdLeft}>{pos.strategy_name ? <span style={{ fontSize: '11px', background: `${C.accent}18`, color: C.accent, border: `1px solid ${C.accent}33`, borderRadius: '4px', padding: '2px 7px', fontWeight: 600 }}>{pos.strategy_name}</span> : <span style={{ fontSize: '11px', color: C.muted }}>Manual</span>}</td>
                    <td style={styles.td}><span style={styles.actionBadge(action)}>{action.toUpperCase()}</span></td>
                    <td style={styles.td}><span style={styles.typeBadge(pos.option_type as 'call' | 'put')}>{pos.option_type.toUpperCase()}</span></td>
                    <td style={styles.td}>{pos.expiry}</td>
                    <td style={{ ...styles.td, color: dteColor, fontWeight: daysLeft <= 21 ? 700 : 400 }}>{daysLeft}d</td>
                    <td style={styles.td}>${fmt(pos.strike)}</td>
                    <td style={{ ...styles.td, color: pos.quantity < 0 ? C.red : C.text }}>{pos.quantity > 0 ? '+' : ''}{pos.quantity}</td>
                    <td style={styles.td}>${fmt(pos.avg_cost)}</td>
                    <td style={{ ...styles.td, color: C.muted }}>${fmt(totalCost, 0)}</td>
                    <td style={styles.td}>${fmt(pos.current_price)}</td>
                    <td style={{ ...styles.td, color: pnlColor, fontWeight: 600 }}>{pos.pnl >= 0 ? '+' : ''}${fmt(pos.pnl)}</td>
                    <td style={{ ...styles.td, color: pnlColor, fontWeight: 700 }}>{pct >= 0 ? '+' : ''}{fmt(pct)}%</td>
                    <td style={styles.td}><TargetBar pos={pos} /></td>
                    <td style={styles.td}>{fmt(pos.delta, 3)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ marginTop: '10px', fontSize: '11px', color: C.muted, textAlign: 'right' }}>Strategy-linked positions use the recommended profit target. Manual positions default to +50% (tastylive standard). DTE turns amber at 21 days, red at 7.</div>
        </div>
      )}
      <HowToClose />
    </div>
  )
}

function HowToClose() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: C.surface, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>📋 How to close a position — step by step</span>
        <span style={{ color: C.muted, fontSize: '16px' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ background: '#0f1117', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px', marginBottom: '4px' }}>
            <div style={{ background: '#0f2d1a', border: `1px solid ${C.green}44`, borderRadius: '8px', padding: '12px' }}><div style={{ fontSize: '11px', fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>✅ Take profit when…</div><div style={{ fontSize: '12px', color: C.text, lineHeight: 1.65 }}>The <strong>Target</strong> column shows "✅ Close Now" — P&L has hit the strategy's recommended exit level.</div></div>
            <div style={{ background: '#2d0f0f', border: `1px solid ${C.red}44`, borderRadius: '8px', padding: '12px' }}><div style={{ fontSize: '11px', fontWeight: 700, color: C.red, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>🛑 Cut loss when…</div><div style={{ fontSize: '12px', color: C.text, lineHeight: 1.65 }}>The Target shows "🛑 Stop Loss" — loss has hit the stop level (50% for longs, 2× credit for shorts).</div></div>
            <div style={{ background: '#2d1f0a', border: `1px solid ${C.amber}44`, borderRadius: '8px', padding: '12px' }}><div style={{ fontSize: '11px', fontWeight: 700, color: C.amber, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>⏰ Time rule when…</div><div style={{ fontSize: '12px', color: C.text, lineHeight: 1.65 }}>DTE column turns amber (21 days) or red (7 days). Close regardless of P&L — decay accelerates.</div></div>
          </div>
          <div style={{ background: C.surface2, borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Steps to close any position</div>
            <ol style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: C.text, lineHeight: 2 }}>
              <li>Find the row in the table. Note: <strong>Symbol, Expiry, Strike, Type, Qty</strong>.</li>
              <li>Open <strong>Order Entry</strong> (right sidebar on desktop · "+ Place Order" on mobile).</li>
              <li>Enter the same Symbol, Expiry, Strike, and Type.</li>
              <li>Set Action to the <strong>opposite</strong>: Qty is <strong style={{ color: C.green }}>positive (+)</strong> → <strong>Sell</strong> · Qty is <strong style={{ color: C.red }}>negative (−)</strong> → <strong>Buy</strong>.</li>
              <li>Set Quantity to the number in the Qty column (use the positive value).</li>
              <li>Click the button and confirm. Hit <strong>↻ Refresh</strong> above to confirm it's gone.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
