import { useEffect, useState, useCallback } from 'react'
import { getPositionsRisk, PositionRisk, RiskSignal } from '../api/client'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#64748b',
  accent: '#7c6af7',
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
}

const REFRESH_MS = 5 * 60 * 1000 // 5 min

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function riskColor(level: string) {
  if (level === 'red') return C.red
  if (level === 'yellow') return C.yellow
  return C.green
}

function riskBg(level: string) {
  if (level === 'red') return '#2d0a0a'
  if (level === 'yellow') return '#2a2000'
  return '#0a2d14'
}

function riskLabel(level: string) {
  if (level === 'red') return '🔴 HIGH RISK'
  if (level === 'yellow') return '🟡 WATCH'
  return '🟢 OK'
}

function signalIcon(type: string) {
  const icons: Record<string, string> = {
    dte: '⏰', pnl: '💰', iv: '📊', bias: '🧭', healthy: '✅',
  }
  return icons[type] || '•'
}

function ProgressBar({ pct, target, level }: { pct: number; target: number; level: string }) {
  const clampedPct = Math.max(-100, Math.min(200, pct))
  const isPositive = clampedPct >= 0
  const barPct = Math.min(Math.abs(clampedPct) / Math.max(target, 1) * 100, 100)
  const color = isPositive ? (clampedPct >= target ? C.green : C.accent) : riskColor(level)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: C.muted }}>
        <span style={{ color: isPositive ? C.green : C.red, fontWeight: 700 }}>
          {isPositive ? '+' : ''}{fmt(pct, 1)}%
        </span>
        <span>target {fmt(target, 0)}%</span>
      </div>
      <div style={{ height: '4px', background: '#252836', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${barPct}%`,
          background: color,
          borderRadius: '2px',
          transition: 'width 0.3s',
        }} />
      </div>
    </div>
  )
}

function PositionCard({ pos }: { pos: PositionRisk }) {
  const [expanded, setExpanded] = useState(false)
  const borderColor = riskColor(pos.risk_level)
  const bgColor = riskBg(pos.risk_level)

  const redSignals = pos.signals.filter(s => s.level === 'red')
  const yellowSignals = pos.signals.filter(s => s.level === 'yellow')
  const greenSignals = pos.signals.filter(s => s.level === 'green')
  const urgentSignals = [...redSignals, ...yellowSignals]

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}44`,
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: '8px',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>{pos.symbol}</span>
            <span style={{ fontSize: '11px', color: C.muted }}>
              ${fmt(pos.strike, 0)} {pos.option_type.toUpperCase()} · {pos.expiry}
            </span>
            {pos.strategy_name && (
              <span style={{ fontSize: '10px', background: '#1a1440', border: '1px solid #7c6af744', color: C.accent, padding: '1px 6px', borderRadius: '8px' }}>
                {pos.strategy_name}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: borderColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {riskLabel(pos.risk_level)}
          </span>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '14px', padding: '0 2px', lineHeight: 1 }}
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Key metrics row */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '60px' }}>
          <span style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>DTE</span>
          <span style={{ fontSize: '16px', fontWeight: 700, color: pos.dte <= 7 ? C.red : pos.dte <= 21 ? C.yellow : C.text }}>
            {pos.dte}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '60px' }}>
          <span style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>P&L</span>
          <span style={{ fontSize: '16px', fontWeight: 700, color: pos.pnl >= 0 ? C.green : C.red }}>
            {pos.pnl >= 0 ? '+' : ''}${fmt(pos.pnl)}
          </span>
        </div>
        {pos.iv_rank !== undefined && pos.iv_rank !== null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '60px' }}>
            <span style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>IVR</span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: pos.iv_rank > 50 ? C.yellow : C.text }}>
              {fmt(pos.iv_rank, 0)}
            </span>
          </div>
        )}
        {pos.bias && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '60px' }}>
            <span style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bias</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: pos.bias === 'BULLISH' ? C.green : pos.bias === 'BEARISH' ? C.red : C.muted }}>
              {pos.bias}
            </span>
          </div>
        )}
        <div style={{ flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <ProgressBar pct={pos.pnl_pct} target={pos.profit_target_pct} level={pos.risk_level} />
        </div>
      </div>

      {/* Urgent signals — always visible */}
      {urgentSignals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {urgentSignals.map((s, i) => (
            <SignalRow key={i} signal={s} />
          ))}
        </div>
      )}

      {/* Expanded: all signals + details */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {greenSignals.map((s, i) => (
            <SignalRow key={i} signal={s} />
          ))}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '11px', color: C.muted, marginTop: '4px' }}>
            <span>Qty: {pos.quantity > 0 ? '+' : ''}{pos.quantity}</span>
            <span>Avg cost: ${fmt(pos.avg_cost)}</span>
            <span>Current: ${fmt(pos.current_price)}</span>
            {pos.iv_environment && <span>IV env: {pos.iv_environment}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function SignalRow({ signal }: { signal: RiskSignal }) {
  const color = riskColor(signal.level)
  const bg = signal.level === 'green' ? 'transparent' : riskBg(signal.level)
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '6px',
      padding: signal.level !== 'green' ? '5px 8px' : '2px 0',
      background: bg,
      borderRadius: '4px',
      border: signal.level !== 'green' ? `1px solid ${color}33` : 'none',
    }}>
      <span style={{ fontSize: '12px', flexShrink: 0, marginTop: '1px' }}>{signalIcon(signal.type)}</span>
      <span style={{ fontSize: '11px', color: signal.level === 'green' ? C.muted : color, lineHeight: 1.4 }}>
        {signal.msg}
      </span>
    </div>
  )
}

export default function RiskMonitor() {
  const [data, setData] = useState<PositionRisk[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const result = await getPositionsRisk()
      setData(result)
      setLastUpdated(new Date())
    } catch (e: any) {
      if (!silent) setError(e?.response?.data?.detail || e?.message || 'Failed to load risk data')
    } finally {
      if (silent) setRefreshing(false)
      else setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const interval = setInterval(() => load(true), REFRESH_MS)
    return () => clearInterval(interval)
  }, [load])

  const redCount = data.filter(p => p.risk_level === 'red').length
  const yellowCount = data.filter(p => p.risk_level === 'yellow').length

  return (
    <div style={{ marginTop: '16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: C.text, flex: 1 }}>
          Risk Monitor
        </span>
        {redCount > 0 && (
          <span style={{ fontSize: '11px', background: '#2d0a0a', border: `1px solid ${C.red}44`, color: C.red, padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
            {redCount} urgent
          </span>
        )}
        {yellowCount > 0 && (
          <span style={{ fontSize: '11px', background: '#2a2000', border: `1px solid ${C.yellow}44`, color: C.yellow, padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
            {yellowCount} watch
          </span>
        )}
        {lastUpdated && (
          <span style={{ fontSize: '10px', color: C.muted }}>
            {refreshing ? 'Updating…' : `${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          </span>
        )}
        <button
          onClick={() => load(true)}
          disabled={refreshing || loading}
          style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '6px', color: C.muted, padding: '3px 8px', fontSize: '11px', cursor: 'pointer', opacity: refreshing ? 0.5 : 1 }}
        >
          Refresh
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '520px', overflowY: 'auto' }}>
        {loading && (
          <div style={{ color: C.muted, fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
            Analysing positions…
          </div>
        )}
        {!loading && error && (
          <div style={{ color: C.red, fontSize: '12px', padding: '10px' }}>{error}</div>
        )}
        {!loading && !error && data.length === 0 && (
          <div style={{ color: C.muted, fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
            No open positions to monitor
          </div>
        )}
        {!loading && data.length > 0 && (
          <>
            {/* Sort: red first, then yellow, then green */}
            {[...data]
              .sort((a, b) => {
                const rank = { red: 0, yellow: 1, green: 2 }
                return rank[a.risk_level] - rank[b.risk_level]
              })
              .map((pos, i) => (
                <PositionCard key={`${pos.symbol}-${pos.strike}-${pos.expiry}-${pos.option_type}-${i}`} pos={pos} />
              ))
            }
          </>
        )}
      </div>
    </div>
  )
}
