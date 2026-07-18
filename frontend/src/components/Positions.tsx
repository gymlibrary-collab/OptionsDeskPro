import React, { useEffect, useState, useCallback } from 'react'
import { getPositions, getPortfolio, getQuote, Position, PortfolioSummary, recordTrade, Quote, getGreeksCoaching, GreeksCoachingResponse, updatePositionAvgCost, getClosedPositions, ClosedPosition } from '../api/client'
import { useEntitlements } from '../context/EntitlementsContext'
import { useWindowSize } from '../hooks/useWindowSize'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtDate(iso: string): string {
  // yyyy-mm-dd → dd-mm-yyyy
  const parts = iso.split('-')
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : iso
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
          detail = `${stratLabel}${dte(a.pos.expiry)} days to expiry. Good practice: close at 21 DTE regardless of P&L.`
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
                    <li>Find the row in the table and click the <strong>Close</strong> button on the right.</li>
                    <li>Review the confirmation: symbol <strong>{a.pos.symbol}</strong> · strike <strong>${fmt(a.pos.strike)}</strong> · action <strong>{a.pos.quantity > 0 ? 'SELL' : 'BUY'}</strong> · qty <strong>{Math.abs(a.pos.quantity)}</strong>.</li>
                    <li>Click <strong>Confirm Close</strong>. Hit <strong>↻ Refresh</strong> above to confirm it's gone.</li>
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

function PortfolioGreeksStrip({ entitledToCoaching }: { entitledToCoaching: boolean }) {
  const [coaching, setCoaching] = useState<GreeksCoachingResponse | null>(null)
  const [coachingText, setCoachingText] = useState<string | null>(null)
  const [coachingLoading, setCoachingLoading] = useState(false)
  const [coachingError, setCoachingError] = useState<string | null>(null)
  const [greeksLoading, setGreeksLoading] = useState(true)
  const [greeksError, setGreeksError] = useState<string | null>(null)

  useEffect(() => {
    getGreeksCoaching()
      .then(data => { setCoaching(data) })
      .catch(e => {
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        setGreeksError(typeof detail === 'string' ? detail : 'Could not load portfolio greeks.')
      })
      .finally(() => setGreeksLoading(false))
  }, [])

  const handleGetCoaching = async () => {
    if (!coaching) return
    setCoachingLoading(true)
    setCoachingError(null)
    try {
      const data = await getGreeksCoaching()
      setCoaching(data)
      setCoachingText(data.coaching)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setCoachingError(err?.response?.data?.detail || 'Could not load coaching.')
    } finally {
      setCoachingLoading(false)
    }
  }

  function fmtGreek(n: number, d = 2) {
    return (n >= 0 ? '+' : '') + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  }

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: '8px',
      padding: '14px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Portfolio Greeks
      </div>

      {greeksLoading && (
        <div style={{ fontSize: '13px', color: C.muted }}>Loading greeks…</div>
      )}

      {!greeksLoading && greeksError && (
        <div style={{ fontSize: '13px', color: C.red }}>{greeksError}</div>
      )}

      {!greeksLoading && !greeksError && coaching && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={styles.card}>
            <span style={styles.cardLabel}>Net Delta</span>
            <span style={{ ...styles.cardValue, fontSize: '18px', color: coaching.net_delta >= 0 ? C.green : C.red }}>
              {fmtGreek(coaching.net_delta, 1)}
            </span>
          </div>
          <div style={styles.card}>
            <span style={styles.cardLabel}>Net Gamma</span>
            <span style={{ ...styles.cardValue, fontSize: '18px', color: coaching.net_gamma >= 0 ? C.green : C.red }}>
              {fmtGreek(coaching.net_gamma, 2)}
            </span>
          </div>
          <div style={styles.card}>
            <span style={styles.cardLabel}>Net Theta</span>
            <span style={{ ...styles.cardValue, fontSize: '18px', color: coaching.net_theta >= 0 ? C.green : C.red }}>
              {fmtGreek(coaching.net_theta, 2)}
            </span>
          </div>
          <div style={styles.card}>
            <span style={styles.cardLabel}>Net Vega</span>
            <span style={{ ...styles.cardValue, fontSize: '18px', color: coaching.net_vega >= 0 ? C.green : C.red }}>
              {fmtGreek(coaching.net_vega, 2)}
            </span>
          </div>

          {entitledToCoaching ? (
            <button
              onClick={handleGetCoaching}
              disabled={coachingLoading}
              style={{
                background: 'transparent',
                border: `1px solid ${C.accent}`,
                borderRadius: '6px',
                color: C.accent,
                padding: '7px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: coachingLoading ? 'default' : 'pointer',
                opacity: coachingLoading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span style={{ fontSize: '14px' }}>✦</span>
              {coachingLoading ? 'Loading coaching…' : 'Get coaching'}
            </button>
          ) : (
            <span
              title="Requires Pro"
              style={{ fontSize: '12px', color: C.muted, display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              🔒 Get coaching — Requires Pro
            </span>
          )}
        </div>
      )}

      {coachingError && (
        <div style={{ fontSize: '12px', color: C.red }}>{coachingError}</div>
      )}

      {coachingText && (
        <div style={{
          background: '#1a1440',
          border: `1px solid ${C.accent}44`,
          borderRadius: '8px',
          padding: '12px 14px',
          fontSize: '13px',
          color: C.text,
          lineHeight: 1.7,
        }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
            ✦ Greeks Coaching
          </div>
          {coachingText}
        </div>
      )}
    </div>
  )
}

interface RecordTradeFormProps {
  onSuccess: () => void
}

function RecordTradeForm({ onSuccess }: RecordTradeFormProps) {
  const { isMobile } = useWindowSize()
  const [open, setOpen] = useState(false)
  const [symbol, setSymbol] = useState('')
  const [expiry, setExpiry] = useState('')
  const [strike, setStrike] = useState('')
  const [optionType, setOptionType] = useState<'call' | 'put'>('call')
  const [action, setAction] = useState<'buy' | 'sell'>('buy')
  const [qty, setQty] = useState('1')
  const [price, setPrice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = () => {
    setSymbol('')
    setExpiry('')
    setStrike('')
    setOptionType('call')
    setAction('buy')
    setQty('1')
    setPrice('')
    setError(null)
  }

  const handleCancel = () => {
    resetForm()
    setOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const strikeNum = parseFloat(strike)
    const priceNum = parseFloat(price)
    const qtyNum = parseInt(qty, 10)

    if (!symbol.trim()) { setError('Symbol is required.'); return }
    if (!expiry) { setError('Expiry date is required.'); return }
    if (isNaN(strikeNum) || strikeNum <= 0) { setError('Strike must be a positive number.'); return }
    if (isNaN(qtyNum) || qtyNum < 1) { setError('Quantity must be a positive integer.'); return }
    if (isNaN(priceNum) || priceNum < 0) { setError('Price must be a non-negative number.'); return }

    setSubmitting(true)
    try {
      await recordTrade({
        symbol: symbol.trim().toUpperCase(),
        strategy_key: 'manual',
        strategy_name: 'Manual',
        expiry,
        profit_target_pct: 50,
        legs: [{
          role: 'open',
          option_type: optionType,
          strike: strikeNum,
          action,
          quantity: qtyNum,
          price: priceNum,
        }],
      })
      resetForm()
      setOpen(false)
      onSuccess()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      setError(err?.response?.data?.detail || err?.message || 'Failed to record trade.')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleStyle = (active: boolean, color: string): React.CSSProperties => ({
    padding: '5px 14px',
    borderRadius: '4px',
    border: `1px solid ${active ? color : C.border}`,
    background: active ? `${color}22` : 'transparent',
    color: active ? color : C.muted,
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.04em',
    transition: 'all 0.15s',
  })

  const inputStyle: React.CSSProperties = {
    background: '#252836',
    border: `1px solid ${C.border}`,
    borderRadius: '5px',
    color: C.text,
    fontSize: '13px',
    padding: '6px 9px',
    outline: 'none',
    width: '100%',
    fontVariantNumeric: 'tabular-nums',
    boxSizing: 'border-box',
  }

  const fieldStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: isMobile ? '100%' : undefined,
    flex: '1 1 auto',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 700,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
  }

  return (
    <div>
      {/* Header row: toggle button lives here, positioned to the right by the parent */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            background: 'transparent',
            border: `1px solid ${C.accent}`,
            borderRadius: '6px',
            color: C.accent,
            padding: '6px 14px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.03em',
            whiteSpace: 'nowrap',
          }}
        >
          + Record Trade
        </button>
      )}

      {open && (
        <div style={{
          background: '#1a1d27',
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Record Trade
            </span>
            <button
              onClick={handleCancel}
              disabled={submitting}
              style={{ background: 'none', border: 'none', color: C.muted, cursor: submitting ? 'default' : 'pointer', fontSize: '12px', padding: '0', textDecoration: 'underline' }}
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>

              {/* Symbol */}
              <div style={{ ...fieldStyle, minWidth: isMobile ? '100%' : '80px', maxWidth: isMobile ? '100%' : '100px' }}>
                <label style={labelStyle}>Symbol</label>
                <input
                  type="text"
                  placeholder="QQQ"
                  value={symbol}
                  onChange={e => setSymbol(e.target.value.toUpperCase())}
                  style={inputStyle}
                  disabled={submitting}
                  autoComplete="off"
                  autoCapitalize="characters"
                />
              </div>

              {/* Expiry */}
              <div style={{ ...fieldStyle, minWidth: isMobile ? '100%' : '130px', maxWidth: isMobile ? '100%' : '150px' }}>
                <label style={labelStyle}>Expiry</label>
                <input
                  type="date"
                  value={expiry}
                  onChange={e => setExpiry(e.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                  disabled={submitting}
                />
              </div>

              {/* Strike */}
              <div style={{ ...fieldStyle, minWidth: isMobile ? 'calc(50% - 5px)' : '90px', maxWidth: isMobile ? 'calc(50% - 5px)' : '110px' }}>
                <label style={labelStyle}>Strike</label>
                <input
                  type="number"
                  placeholder="450"
                  min="0"
                  step="0.5"
                  value={strike}
                  onChange={e => setStrike(e.target.value)}
                  style={inputStyle}
                  disabled={submitting}
                />
              </div>

              {/* Qty */}
              <div style={{ ...fieldStyle, minWidth: isMobile ? 'calc(50% - 5px)' : '60px', maxWidth: isMobile ? 'calc(50% - 5px)' : '80px' }}>
                <label style={labelStyle}>Qty</label>
                <input
                  type="number"
                  placeholder="1"
                  min="1"
                  step="1"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  style={inputStyle}
                  disabled={submitting}
                />
              </div>

              {/* Price */}
              <div style={{ ...fieldStyle, minWidth: isMobile ? 'calc(50% - 5px)' : '80px', maxWidth: isMobile ? 'calc(50% - 5px)' : '100px' }}>
                <label style={labelStyle}>Price / share</label>
                <input
                  type="number"
                  placeholder="7.30"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  style={inputStyle}
                  disabled={submitting}
                />
              </div>

              {/* Action toggle */}
              <div style={{ ...fieldStyle, minWidth: isMobile ? 'calc(50% - 5px)' : 'auto', flex: '0 0 auto' }}>
                <label style={labelStyle}>Action</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button type="button" onClick={() => setAction('buy')} disabled={submitting} style={toggleStyle(action === 'buy', C.green)}>BUY</button>
                  <button type="button" onClick={() => setAction('sell')} disabled={submitting} style={toggleStyle(action === 'sell', C.red)}>SELL</button>
                </div>
              </div>

              {/* Type toggle */}
              <div style={{ ...fieldStyle, minWidth: isMobile ? 'calc(50% - 5px)' : 'auto', flex: '0 0 auto' }}>
                <label style={labelStyle}>Type</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button type="button" onClick={() => setOptionType('call')} disabled={submitting} style={toggleStyle(optionType === 'call', '#3b82f6')}>CALL</button>
                  <button type="button" onClick={() => setOptionType('put')} disabled={submitting} style={toggleStyle(optionType === 'put', '#a855f7')}>PUT</button>
                </div>
              </div>

              {/* Submit */}
              <div style={{ ...fieldStyle, flex: '0 0 auto', minWidth: isMobile ? '100%' : 'auto' }}>
                <label style={{ ...labelStyle, visibility: 'hidden' }}>Submit</label>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    background: submitting ? C.border : C.accent,
                    border: 'none',
                    borderRadius: '5px',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 700,
                    padding: '6px 18px',
                    cursor: submitting ? 'default' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                    whiteSpace: 'nowrap',
                    width: isMobile ? '100%' : undefined,
                  }}
                >
                  {submitting ? 'Recording…' : 'Record Trade'}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                padding: '8px 12px',
                borderRadius: '6px',
                background: '#2d0f0f',
                border: `1px solid ${C.red}`,
                color: C.red,
                fontSize: '12px',
              }}>
                {error}
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  )
}

export default function Positions({ onTradeRecorded, onPositionUpdated, refreshSignal }: { onTradeRecorded?: () => void; onPositionUpdated?: () => void; refreshSignal?: number }) {
  const { entitlements } = useEntitlements()
  const [positions, setPositions] = useState<Position[]>([])
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [closingPos, setClosingPos] = useState<Position | null>(null)
  const [closeQty, setCloseQty] = useState<number>(1)
  const [closePrice, setClosePrice] = useState<number>(0)
  const [closePriceError, setClosePriceError] = useState<string | null>(null)
  const [closeLoading, setCloseLoading] = useState(false)
  const [closeFeedback, setCloseFeedback] = useState<{ success: boolean; msg: string } | null>(null)
  const [stockPrices, setStockPrices] = useState<Record<string, Quote>>({})
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [editSaving, setEditSaving] = useState(false)
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([])

  const greeksCoachingEnabled = entitlements?.features?.greeks_coaching ?? false

  const load = useCallback(() => {
    setLoading(true)
    Promise.allSettled([getPositions(), getPortfolio(), getClosedPositions()])
      .then(([posResult, sumResult, closedResult]) => {
        if (posResult.status === 'fulfilled') {
          setPositions(posResult.value)
          const symbols = [...new Set(posResult.value.map((p: Position) => p.symbol))]
          Promise.all(symbols.map((s: string) => getQuote(s).then(q => ({ s, q })).catch(() => null)))
            .then(results => {
              const map: Record<string, Quote> = {}
              results.forEach(r => { if (r) map[r.s] = r.q })
              setStockPrices(map)
            })
        }
        if (sumResult.status === 'fulfilled') setSummary(sumResult.value)
        setClosedPositions(closedResult.status === 'fulfilled' ? closedResult.value : [])
        setLastRefresh(new Date())
      })
      .finally(() => setLoading(false))
  }, [])

  // refreshSignal is an incrementing counter from the parent. Using a prop instead of
  // remounting via key= avoids the bfcache flicker where two Positions sections briefly
  // co-exist in the DOM during React 18 concurrent reconciliation.
  useEffect(() => { load() }, [load, refreshSignal])

  useEffect(() => {
    const id = setInterval(load, 120_000)
    return () => clearInterval(id)
  }, [load])

  // Sync closePrice to the current mark whenever the position being closed changes.
  useEffect(() => {
    if (closingPos) {
      setClosePrice(closingPos.current_price)
      setClosePriceError(null)
    }
  }, [closingPos])

  const handleConfirmClose = useCallback(async () => {
    if (!closingPos) return
    if (closePriceError !== null) return
    const maxQty = Math.abs(closingPos.quantity)
    const qty = Math.min(Math.max(1, closeQty), maxQty)
    const isPartial = qty < maxQty
    setCloseLoading(true)
    setCloseFeedback(null)
    const closeAction = closingPos.quantity > 0 ? 'sell' : 'buy'
    try {
      await recordTrade({
        symbol: closingPos.symbol,
        strategy_key: closingPos.strategy_key || 'manual_close',
        strategy_name: `${isPartial ? 'Partial Close' : 'Close'}: ${closingPos.strategy_name || 'Manual'}`,
        expiry: closingPos.expiry,
        profit_target_pct: 0,
        legs: [{
          role: 'close',
          option_type: closingPos.option_type,
          strike: closingPos.strike,
          action: closeAction,
          quantity: qty,
          price: closePrice,
        }],
      })
      const label = isPartial
        ? `Partially closed ${qty}/${maxQty} contracts: ${closingPos.symbol} $${fmt(closingPos.strike)} ${closingPos.option_type.toUpperCase()}`
        : `Closed: ${closingPos.symbol} $${fmt(closingPos.strike)} ${closingPos.option_type.toUpperCase()}`
      setCloseFeedback({ success: true, msg: label })
      setClosingPos(null)
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      setCloseFeedback({ success: false, msg: err?.response?.data?.detail || err?.message || 'Close failed' })
    } finally {
      setCloseLoading(false)
    }
  }, [closingPos, closeQty, closePrice, closePriceError, load])

  const handleSaveAvgCost = useCallback(async (pos: Position) => {
    const parsed = parseFloat(editValue)
    if (isNaN(parsed) || parsed < 0) {
      alert('Please enter a valid non-negative price.')
      return
    }
    setEditSaving(true)
    try {
      await updatePositionAvgCost({
        symbol: pos.symbol,
        expiry: pos.expiry,
        strike: pos.strike,
        option_type: pos.option_type,
        avg_cost: parsed,
      })
      // Optimistic update — no need to reload live prices from yfinance
      setPositions(prev => prev.map(p => {
        if (p.symbol !== pos.symbol || p.expiry !== pos.expiry || p.strike !== pos.strike || p.option_type !== pos.option_type) return p
        const isLong = (p.entry_action ?? (p.quantity > 0 ? 'buy' : 'sell')) === 'buy'
        const newPnl = isLong
          ? (p.current_price - parsed) * p.quantity * 100
          : (parsed - p.current_price) * Math.abs(p.quantity) * 100
        return { ...p, avg_cost: parsed, pnl: newPnl }
      }))
      setEditingKey(null)
      onPositionUpdated?.()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      alert(err?.response?.data?.detail || err?.message || 'Failed to update price.')
    } finally {
      setEditSaving(false)
    }
  }, [editValue])

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

      {/* Close confirmation modal */}
      {closingPos && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => !closeLoading && setClosingPos(null)}>
          <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: '12px', padding: '24px', maxWidth: '440px', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: C.text, borderBottom: `1px solid ${C.border}`, paddingBottom: '12px' }}>
              Close Position
            </div>
            <div style={{ fontSize: '13px', color: C.text, lineHeight: 1.7 }}>
              You are about to close:{' '}
              <strong style={{ color: C.accent }}>{closingPos.symbol}</strong>{' '}
              <strong>${fmt(closingPos.strike)}</strong>{' '}
              <strong style={{ color: closingPos.option_type === 'call' ? '#3b82f6' : '#a855f7' }}>{closingPos.option_type.toUpperCase()}</strong>{' '}
              expiring <strong>{closingPos.expiry}</strong>.
            </div>
            <div style={{ background: '#252836', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: C.muted }}>Closing action</span>
                <strong style={{ color: closingPos.quantity > 0 ? C.red : C.green }}>
                  {closingPos.quantity > 0 ? 'SELL' : 'BUY'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: C.muted }}>
                  Qty to close
                  <span style={{ color: C.muted, fontWeight: 400, marginLeft: '4px' }}>
                    (max {Math.abs(closingPos.quantity)})
                  </span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="number"
                    min={1}
                    max={Math.abs(closingPos.quantity)}
                    step={1}
                    value={closeQty}
                    onChange={e => setCloseQty(Math.max(1, Math.min(Math.abs(closingPos.quantity), parseInt(e.target.value) || 1)))}
                    style={{
                      width: '60px',
                      background: '#1a1d27',
                      border: `1px solid ${C.accent}`,
                      borderRadius: '4px',
                      color: C.text,
                      fontSize: '13px',
                      padding: '3px 7px',
                      outline: 'none',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  />
                  {closeQty < Math.abs(closingPos.quantity) && (
                    <span style={{ fontSize: '10px', color: C.amber, fontWeight: 700 }}>PARTIAL</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: C.muted }}>Closing price (per contract)</span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={closePrice}
                    onChange={e => {
                      const raw = e.target.value
                      const parsed = raw === '' ? 0 : parseFloat(raw)
                      const val = isNaN(parsed) ? 0 : parsed
                      setClosePrice(val)
                      setClosePriceError(val < 0 ? 'Price must be ≥ 0' : null)
                    }}
                    style={{
                      width: '90px',
                      background: '#1a1d27',
                      border: `1px solid ${closePriceError ? C.red : C.accent}`,
                      borderRadius: '4px',
                      color: C.text,
                      fontSize: '13px',
                      padding: '3px 7px',
                      outline: 'none',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  />
                  {closePriceError && (
                    <span style={{ fontSize: '10px', color: C.red }}>{closePriceError}</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.muted }}>Est. proceeds / cost</span>
                <strong style={{ color: C.text }}>${fmt(closePrice * closeQty * 100)}</strong>
              </div>
            </div>
            {closeFeedback && !closeFeedback.success && (
              <div style={{ padding: '10px', borderRadius: '6px', background: '#2d0f0f', border: `1px solid ${C.red}`, color: C.red, fontSize: '12px' }}>
                {closeFeedback.msg}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setClosingPos(null)} disabled={closeLoading}
                style={{ flex: 1, padding: '11px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.surface2, color: C.muted, fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleConfirmClose} disabled={closeLoading || closePriceError !== null}
                style={{ flex: 2, padding: '11px', borderRadius: '8px', border: 'none', background: C.red, color: '#fff', fontSize: '13px', fontWeight: 700, cursor: (closeLoading || closePriceError !== null) ? 'default' : 'pointer', opacity: (closeLoading || closePriceError !== null) ? 0.6 : 1 }}>
                {closeLoading ? 'Closing…' : 'Confirm Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close success feedback */}
      {closeFeedback?.success && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: '#0f2d1a', border: `1px solid ${C.green}66`, color: C.green, fontSize: '13px', fontWeight: 600 }}>
          ✅ {closeFeedback.msg} — position removed.{' '}
          <button onClick={() => setCloseFeedback(null)} style={{ background: 'none', border: 'none', color: C.green, cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Dismiss</button>
        </div>
      )}

      <AlertBanner alerts={alerts} />

      {/* Positions header row: title + Record Trade */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Open Positions
        </span>
        <RecordTradeForm onSuccess={() => { load(); onTradeRecorded?.() }} />
      </div>

      {/* Summary cards + refresh */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
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
            <span style={{ ...styles.cardValue, color: totalPnl >= 0 ? C.green : C.red }}>
              {totalPnl >= 0 ? '+' : ''}${fmt(totalPnl)}
            </span>
          </div>
          <div style={styles.card}>
            <span style={styles.cardLabel}>Net Delta</span>
            <span style={styles.cardValue}>{fmt(totalDelta, 1)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', marginLeft: 'auto' }}>
          <button
            onClick={load}
            disabled={loading}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '6px', color: C.muted, padding: '6px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
          >
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <span style={{ fontSize: '10px', color: C.muted }}>Auto-refreshes every 2 min · Last: {lastRefresh.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* E6 — Portfolio Greeks strip (always visible when positions exist, coaching gated) */}
      {positions.length > 0 && <PortfolioGreeksStrip entitledToCoaching={greeksCoachingEnabled} />}

      {/* Positions table */}
      {positions.length === 0 ? (
        <div style={styles.empty}>
          {loading ? 'Loading positions…' : 'No open positions. Run a strategy scan and place a paper trade to start monitoring.'}
        </div>
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
                <th style={styles.th}></th>
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
                const rowKey = `${pos.symbol}-${pos.expiry}-${pos.strike}-${pos.option_type}`
                const isEditingThis = editingKey === rowKey
                return (
                  <tr key={i} style={rowBg ? { background: rowBg } : undefined}>
                    <td style={{ ...styles.tdLeft, fontWeight: 700, color: C.accent }}>
                      {pos.symbol}
                      {stockPrices[pos.symbol] && (
                        <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 600, color: stockPrices[pos.symbol].change >= 0 ? C.green : C.red }}>
                          ${fmt(stockPrices[pos.symbol].price)}{' '}
                          <span style={{ opacity: 0.8 }}>
                            {stockPrices[pos.symbol].changePercent >= 0 ? '+' : ''}{fmt(stockPrices[pos.symbol].changePercent, 2)}%
                          </span>
                        </span>
                      )}
                    </td>
                    <td style={styles.tdLeft}>
                      {pos.strategy_name
                        ? <span style={{ fontSize: '11px', background: `${C.accent}18`, color: C.accent, border: `1px solid ${C.accent}33`, borderRadius: '4px', padding: '2px 7px', fontWeight: 600 }}>{pos.strategy_name}</span>
                        : <span style={{ fontSize: '11px', color: C.muted }}>Manual</span>
                      }
                    </td>
                    <td style={styles.td}>
                      <span style={styles.actionBadge(action)}>{action.toUpperCase()}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.typeBadge(pos.option_type as 'call' | 'put')}>{pos.option_type.toUpperCase()}</span>
                    </td>
                    <td style={styles.td}>{fmtDate(pos.expiry)}</td>
                    <td style={{ ...styles.td, color: dteColor, fontWeight: daysLeft <= 21 ? 700 : 400 }}>{daysLeft}d</td>
                    <td style={styles.td}>${fmt(pos.strike)}</td>
                    <td style={{ ...styles.td, color: pos.quantity < 0 ? C.red : C.text }}>
                      {pos.quantity > 0 ? '+' : ''}{pos.quantity}
                    </td>
                    <td style={{ ...styles.td, minWidth: '130px' }}>
                      {isEditingThis ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                          <span style={{ color: C.muted, fontSize: '12px' }}>$</span>
                          <input
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveAvgCost(pos)
                              if (e.key === 'Escape') setEditingKey(null)
                            }}
                            autoFocus
                            style={{
                              width: '70px',
                              background: '#252836',
                              border: `1px solid ${C.accent}`,
                              borderRadius: '4px',
                              color: C.text,
                              fontSize: '12px',
                              padding: '2px 6px',
                              outline: 'none',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          />
                          <button
                            onClick={() => handleSaveAvgCost(pos)}
                            disabled={editSaving}
                            title="Save"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: editSaving ? C.muted : C.green,
                              cursor: editSaving ? 'default' : 'pointer',
                              fontSize: '14px',
                              padding: '0 2px',
                              lineHeight: 1,
                            }}
                          >
                            {editSaving ? '…' : '✓'}
                          </button>
                          <button
                            onClick={() => setEditingKey(null)}
                            disabled={editSaving}
                            title="Cancel"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: C.muted,
                              cursor: editSaving ? 'default' : 'pointer',
                              fontSize: '14px',
                              padding: '0 2px',
                              lineHeight: 1,
                            }}
                          >
                            ✗
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'flex-end' }}>
                          <span>${fmt(pos.avg_cost)}</span>
                          <button
                            onClick={() => {
                              setEditingKey(rowKey)
                              setEditValue(String(pos.avg_cost))
                            }}
                            title="Edit filled price"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: C.muted,
                              cursor: 'pointer',
                              padding: '0 2px',
                              lineHeight: 1,
                              fontSize: '12px',
                              opacity: 0.7,
                            }}
                          >
                            ✎
                          </button>
                        </div>
                      )}
                    </td>
                    <td style={{ ...styles.td, color: C.muted }}>${fmt(totalCost, 0)}</td>
                    <td style={styles.td}>${fmt(pos.current_price)}</td>
                    <td style={{ ...styles.td, color: pnlColor, fontWeight: 600 }}>
                      {pos.pnl >= 0 ? '+' : ''}${fmt(pos.pnl)}
                    </td>
                    <td style={{ ...styles.td, color: pnlColor, fontWeight: 700 }}>
                      {pct >= 0 ? '+' : ''}{fmt(pct)}%
                    </td>
                    <td style={styles.td}><TargetBar pos={pos} /></td>
                    <td style={styles.td}>{fmt(pos.delta, 3)}</td>
                    <td style={{ ...styles.td, padding: '6px 8px' }}>
                      <button
                        onClick={() => { setCloseFeedback(null); setCloseQty(Math.abs(pos.quantity)); setClosingPos(pos) }}
                        style={{
                          padding: '4px 10px', borderRadius: '5px', border: `1px solid ${C.red}66`,
                          background: '#2d0f0f', color: C.red, fontSize: '11px', fontWeight: 700,
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ marginTop: '10px', fontSize: '11px', color: C.muted, textAlign: 'right' }}>
            Strategy-linked positions use the recommended profit target. Manual positions default to +50% of max profit. DTE turns amber at 21 days, red at 7.
          </div>
        </div>
      )}

      {!loading && closedPositions.length > 0 && (
        <ClosedPositionsAccordion positions={closedPositions} />
      )}

      <HowToClose />
    </div>
  )
}

function ClosedPositionsAccordion({ positions }: { positions: ClosedPosition[] }) {
  const { isMobile } = useWindowSize()
  const [open, setOpen] = useState(false)

  function sourceBadge(pos: ClosedPosition) {
    if (!pos.is_auto_settled || pos.settlement_source == null) return null
    const configs: Record<string, { label: string; color: string; bg: string; border: string }> = {
      market:    { label: 'Market',          color: C.blue,  bg: '#0d1a2d', border: `${C.blue}44` },
      intrinsic: { label: 'Intrinsic',       color: C.amber, bg: '#2d1f0a', border: `${C.amber}44` },
      worthless: { label: 'Expired Worthless', color: C.muted, bg: C.surface2, border: C.border },
    }
    const cfg = configs[pos.settlement_source]
    if (!cfg) return null
    return (
      <span style={{
        display: 'inline-block', padding: '2px 7px', borderRadius: '4px', fontSize: '10px',
        fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
        whiteSpace: 'nowrap' as const,
      }}>
        {cfg.label}
      </span>
    )
  }

  const thStyle: React.CSSProperties = {
    padding: '7px 10px', textAlign: 'right' as const, color: C.muted, fontWeight: 600,
    fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.06em',
    borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' as const, background: C.surface,
  }
  const thLeftStyle: React.CSSProperties = { ...thStyle, textAlign: 'left' as const }
  const tdStyle: React.CSSProperties = {
    padding: '7px 10px', textAlign: 'right' as const, color: C.text,
    borderBottom: `1px solid ${C.border}22`, whiteSpace: 'nowrap' as const, fontSize: '12px',
  }
  const tdLeftStyle: React.CSSProperties = { ...tdStyle, textAlign: 'left' as const }

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
        <span style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>
          Closed Positions ({positions.length})
        </span>
        <span style={{ color: C.muted, fontSize: '16px' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ background: C.surface2, overflowX: 'auto' as const }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px', fontVariantNumeric: 'tabular-nums', minWidth: isMobile ? '600px' : undefined }}>
            <thead>
              <tr>
                <th style={thLeftStyle}>Symbol</th>
                <th style={thLeftStyle}>Strategy</th>
                <th style={thStyle}>Expiry</th>
                <th style={thStyle}>Settlement $</th>
                <th style={thStyle}>Entry $</th>
                <th style={thStyle}>P&L $</th>
                <th style={thStyle}>P&L %</th>
                <th style={thStyle}>Source</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, i) => {
                const pnlColor = pos.realised_pnl == null
                  ? C.muted
                  : pos.realised_pnl >= 0 ? C.green : C.red
                const pnlPctColor = pos.realised_pnl_pct == null
                  ? C.muted
                  : pos.realised_pnl_pct >= 0 ? C.green : C.red
                const closedDate = pos.closed_at
                  ? new Date(pos.closed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
                  : '—'
                return (
                  <tr key={i}>
                    <td style={{ ...tdLeftStyle, fontWeight: 700, color: C.accent }}>
                      {pos.symbol}
                    </td>
                    <td style={tdLeftStyle}>
                      {pos.strategy_name
                        ? <span style={{ fontSize: '11px', background: `${C.accent}18`, color: C.accent, border: `1px solid ${C.accent}33`, borderRadius: '4px', padding: '2px 7px', fontWeight: 600 }}>{pos.strategy_name}</span>
                        : <span style={{ fontSize: '11px', color: C.muted }}>Manual</span>
                      }
                    </td>
                    <td style={tdStyle}>{fmtDate(pos.expiry)}</td>
                    <td style={tdStyle}>${fmt(pos.settlement_price)}</td>
                    <td style={tdStyle}>
                      {pos.entry_avg_cost != null ? `$${fmt(pos.entry_avg_cost)}` : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: pnlColor, fontWeight: 600 }}>
                      {pos.realised_pnl == null
                        ? '—'
                        : `${pos.realised_pnl >= 0 ? '+' : ''}$${fmt(Math.abs(pos.realised_pnl))}`
                      }
                    </td>
                    <td style={{ ...tdStyle, color: pnlPctColor, fontWeight: 700 }}>
                      {pos.realised_pnl_pct == null
                        ? '—'
                        : `${pos.realised_pnl_pct >= 0 ? '+' : ''}${fmt(Math.abs(pos.realised_pnl_pct))}%`
                      }
                    </td>
                    <td style={{ ...tdStyle, paddingRight: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '5px' }}>
                        {sourceBadge(pos)}
                        {!pos.is_auto_settled && (
                          <span style={{ fontSize: '10px', color: C.muted }}>{closedDate}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ padding: '8px 14px', fontSize: '10px', color: C.muted, textAlign: 'right' as const }}>
            Last 90 days · {positions.length} record{positions.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}

function HowToClose() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: C.surface, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <span style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>📋 How to close a position — step by step</span>
        <span style={{ color: C.muted, fontSize: '16px' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ background: '#0f1117', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px', marginBottom: '4px' }}>
            <div style={{ background: '#0f2d1a', border: `1px solid ${C.green}44`, borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>✅ Take profit when…</div>
              <div style={{ fontSize: '12px', color: C.text, lineHeight: 1.65 }}>The <strong>Target</strong> column shows "✅ Close Now" — P&L has hit the strategy's recommended exit level.</div>
            </div>
            <div style={{ background: '#2d0f0f', border: `1px solid ${C.red}44`, borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: C.red, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>🛑 Cut loss when…</div>
              <div style={{ fontSize: '12px', color: C.text, lineHeight: 1.65 }}>The Target shows "🛑 Stop Loss" — loss has hit the stop level (50% for longs, 2× credit for shorts).</div>
            </div>
            <div style={{ background: '#2d1f0a', border: `1px solid ${C.amber}44`, borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: C.amber, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>⏰ Time rule when…</div>
              <div style={{ fontSize: '12px', color: C.text, lineHeight: 1.65 }}>DTE column turns amber (21 days) or red (7 days). Close regardless of P&L — decay accelerates.</div>
            </div>
          </div>
          <div style={{ background: C.surface2, borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Steps to close any position</div>
            <ol style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: C.text, lineHeight: 2 }}>
              <li>Find the row in the table and click the red <strong>Close</strong> button on the far right.</li>
              <li>Review the confirmation dialog: symbol, strike, type, and the offsetting action (BUY or SELL).</li>
              <li>Click <strong>Confirm Close</strong>. The position disappears immediately from the table.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
