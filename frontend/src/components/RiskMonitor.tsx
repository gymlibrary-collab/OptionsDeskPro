import { useEffect, useState, useCallback } from 'react'
import { getPositionsRisk, PositionRisk, RiskSignal, getAISettings, aiRiskSummary, getRollAdvisor, RollAdvisorResponse } from '../api/client'
import { useEntitlements } from '../context/EntitlementsContext'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  surface2: '#252836',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#64748b',
  accent: '#7c6af7',
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
}

const REFRESH_MS = 5 * 60 * 1000

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
  const icons: Record<string, string> = { dte: '⏰', pnl: '💰', iv: '📊', bias: '🦭', healthy: '✅' }
  return icons[type] || '•'
}

function ActionBadge({ action }: { action: string }) {
  const isBuy = action.toLowerCase() === 'buy'
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: isBuy ? '#0f2d1a' : '#2d0f0f', color: isBuy ? '#22c55e' : '#ef4444', border: `1px solid ${isBuy ? '#22c55e' : '#ef4444'}40`, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
      {action.toUpperCase()}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  const isCall = type.toLowerCase() === 'call'
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: isCall ? '#0d1a2d' : '#2d1a2d', color: isCall ? '#3b82f6' : '#a855f7', border: `1px solid ${isCall ? '#3b82f6' : '#a855f7'}40` }}>
      {type.toUpperCase()}
    </span>
  )
}

function ProgressBar({ pct, target, level }: { pct: number; target: number; level: string }) {
  const clampedPct = Math.max(-100, Math.min(200, pct))
  const isPositive = clampedPct >= 0
  const barPct = Math.min(Math.abs(clampedPct) / Math.max(target, 1) * 100, 100)
  const color = isPositive ? (clampedPct >= target ? C.green : C.accent) : riskColor(level)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: C.muted }}>
        <span style={{ color: isPositive ? C.green : C.red, fontWeight: 700 }}>{isPositive ? '+' : ''}{fmt(pct, 1)}%</span>
        <span>target {fmt(target, 0)}%</span>
      </div>
      <div style={{ height: '4px', background: '#252836', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: '2px', transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

function SignalRow({ signal }: { signal: RiskSignal }) {
  const color = riskColor(signal.level)
  const bg = signal.level === 'green' ? 'transparent' : riskBg(signal.level)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', padding: signal.level !== 'green' ? '6px 10px' : '2px 0', background: bg, borderRadius: '4px', border: signal.level !== 'green' ? `1px solid ${color}33` : 'none' }}>
      <span style={{ fontSize: '13px', flexShrink: 0, marginTop: '1px' }}>{signalIcon(signal.type)}</span>
      <span style={{ fontSize: '12px', color: signal.level === 'green' ? C.muted : color, lineHeight: 1.5 }}>{signal.msg}</span>
    </div>
  )
}

function CloseInstructions({ pos }: { pos: PositionRisk }) {
  const entryAction = (pos.entry_action || (pos.quantity > 0 ? 'buy' : 'sell')).toLowerCase()
  const closeAction = entryAction === 'buy' ? 'SELL' : 'BUY'
  const qty = Math.abs(pos.quantity)
  return (
    <div style={{ background: '#1a0a0a', border: `1px solid ${C.red}33`, borderRadius: '6px', padding: '10px 12px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: C.red, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>How to close this position</div>
      <ol style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: C.text, lineHeight: 1.9 }}>
        <li>Open <strong>Order Entry</strong> (right sidebar on desktop · tap "+ Place Order" on mobile).</li>
        <li>Enter: Symbol <strong>{pos.symbol}</strong> · Expiry <strong>{pos.expiry}</strong> · Strike <strong>${fmt(pos.strike, 0)}</strong> · Type <strong>{pos.option_type.toUpperCase()}</strong></li>
        <li>Set Action to <strong style={{ color: closeAction === 'SELL' ? C.red : C.green }}>{closeAction}</strong> · Quantity <strong>{qty}</strong></li>
        <li>Confirm the order. This position will disappear once filled.</li>
      </ol>
    </div>
  )
}

function RollAdvisorPanel({ suggestions, summary }: RollAdvisorResponse) {
  const urgencyColor = (u: string) => {
    if (u === 'HIGH') return C.red
    if (u === 'MEDIUM') return C.yellow
    return C.green
  }
  return (
    <div style={{
      background: '#0d1a2d',
      border: `1px solid #3b82f644`,
      borderRadius: '8px',
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      marginTop: '6px',
    }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Roll / Adjustment Suggestions
      </div>
      {suggestions.map((s, i) => (
        <div key={i} style={{
          background: '#0f1117',
          border: `1px solid ${urgencyColor(s.urgency)}33`,
          borderLeft: `3px solid ${urgencyColor(s.urgency)}`,
          borderRadius: '6px',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{s.action}</span>
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              color: urgencyColor(s.urgency),
              background: `${urgencyColor(s.urgency)}22`,
              border: `1px solid ${urgencyColor(s.urgency)}44`,
              borderRadius: '3px',
              padding: '1px 5px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {s.urgency}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.55 }}>{s.rationale}</div>
        </div>
      ))}
      {summary && (
        <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.6, borderTop: `1px solid ${C.border}`, paddingTop: '8px' }}>
          {summary}
        </div>
      )}
    </div>
  )
}

function PositionCard({ pos, rollAdvisorEnabled, sessionClicks, onSessionClick }: {
  pos: PositionRisk
  rollAdvisorEnabled: boolean
  sessionClicks: number
  onSessionClick: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [rollData, setRollData] = useState<RollAdvisorResponse | null>(null)
  const [rollLoading, setRollLoading] = useState(false)
  const [rollError, setRollError] = useState<string | null>(null)
  const [rollOpen, setRollOpen] = useState(false)

  const borderColor = riskColor(pos.risk_level)
  const bgColor = riskBg(pos.risk_level)
  const entryAction = (pos.entry_action || (pos.quantity > 0 ? 'buy' : 'sell')).toLowerCase()
  const qty = Math.abs(pos.quantity)
  const totalCost = pos.avg_cost * qty * 100
  const currentValue = pos.current_price * qty * 100
  const isSell = entryAction === 'sell'
  const priceUp = isSell
    ? pos.current_price <= pos.avg_cost   // sell: price falling = good
    : pos.current_price >= pos.avg_cost   // buy:  price rising  = good
  const redSignals = pos.signals.filter(s => s.level === 'red')
  const yellowSignals = pos.signals.filter(s => s.level === 'yellow')
  const greenSignals = pos.signals.filter(s => s.level === 'green')
  const urgentSignals = [...redSignals, ...yellowSignals]

  const isUrgent = pos.risk_level === 'red' || pos.risk_level === 'yellow'
  const sessionCapped = sessionClicks >= 5

  const handleRollAdvisor = async () => {
    if (rollOpen) { setRollOpen(false); return }
    if (rollData) { setRollOpen(true); return }
    onSessionClick()
    setRollOpen(true)
    setRollLoading(true)
    setRollError(null)
    try {
      const posId = `${pos.symbol}-${pos.strike}-${pos.expiry}-${pos.option_type}`
      const result = await getRollAdvisor(posId)
      setRollData(result)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setRollError(err?.response?.data?.detail || 'Could not load suggestions.')
      setRollOpen(false)
    } finally {
      setRollLoading(false)
    }
  }

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}44`, borderLeft: `3px solid ${borderColor}`, borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: C.text }}>{pos.symbol}</span>
            <ActionBadge action={entryAction} />
            <TypeBadge type={pos.option_type} />
            <span style={{ fontSize: '12px', color: '#7dd3fc' }}>${fmt(pos.strike, 0)} · {pos.expiry}</span>
            {pos.strategy_name && <span style={{ fontSize: '10px', background: '#1a1440', border: '1px solid #7c6af744', color: C.accent, padding: '1px 7px', borderRadius: '8px', fontWeight: 600 }}>{pos.strategy_name}</span>}
          </div>
          <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>
            {qty} contract{qty !== 1 ? 's' : ''}{' · '}Entry <strong style={{ color: C.text }}>${fmt(pos.avg_cost)}</strong>/share · <strong style={{ color: C.text }}>${fmt(totalCost, 0)}</strong> total
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: borderColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{riskLabel(pos.risk_level)}</span>
          <button onClick={() => setExpanded(e => !e)} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '14px', padding: '0 2px', lineHeight: 1 }}>{expanded ? '▲' : '▼'}</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}><span style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Days Left</span><span style={{ fontSize: '18px', fontWeight: 700, color: pos.dte <= 7 ? C.red : pos.dte <= 21 ? C.yellow : C.text }}>{pos.dte}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}><span style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>P&L</span><span style={{ fontSize: '18px', fontWeight: 700, color: pos.pnl >= 0 ? C.green : C.red }}>{pos.pnl >= 0 ? '+' : ''}${fmt(pos.pnl)}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}><span style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Entry Price</span><span style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>${fmt(pos.avg_cost)}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}><span style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Entry Value</span><span style={{ fontSize: '14px', fontWeight: 700, color: C.muted }}>${fmt(totalCost, 0)}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}><span style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current Price</span><span style={{ fontSize: '14px', fontWeight: 700, color: priceUp ? C.green : C.red }}>${fmt(pos.current_price)}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}><span style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current Value</span><span style={{ fontSize: '14px', fontWeight: 700, color: priceUp ? C.green : C.red }}>${fmt(currentValue, 0)}</span></div>
        {pos.iv_rank !== undefined && pos.iv_rank !== null && <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}><span style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>IV Rank</span><span style={{ fontSize: '18px', fontWeight: 700, color: pos.iv_rank > 50 ? C.yellow : C.text }}>{fmt(pos.iv_rank, 0)}</span></div>}
        {pos.bias && <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}><span style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Mkt Bias</span><span style={{ fontSize: '13px', fontWeight: 700, color: pos.bias === 'BULLISH' ? C.green : pos.bias === 'BEARISH' ? C.red : C.muted }}>{pos.bias}</span></div>}
        <div style={{ flex: 1, minWidth: '140px' }}><ProgressBar pct={pos.pnl_pct} target={pos.profit_target_pct} level={pos.risk_level} /></div>
      </div>
      {urgentSignals.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{urgentSignals.map((s, i) => <SignalRow key={i} signal={s} />)}</div>}
      {pos.risk_level === 'red' && <CloseInstructions pos={pos} />}

      {/* E5 — Roll / Adjustment Advisor (red or yellow positions only) */}
      {isUrgent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {rollAdvisorEnabled ? (
            <button
              onClick={handleRollAdvisor}
              disabled={rollLoading || (sessionCapped && !rollOpen && !rollData)}
              title={sessionCapped && !rollData ? 'Session limit reached (5 uses)' : undefined}
              style={{
                background: rollOpen ? `#3b82f622` : 'transparent',
                border: `1px solid #3b82f666`,
                borderRadius: '6px',
                color: '#3b82f6',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: (rollLoading || (sessionCapped && !rollOpen && !rollData)) ? 'not-allowed' : 'pointer',
                opacity: (sessionCapped && !rollOpen && !rollData) ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span style={{ fontSize: '13px' }}>⚙</span>
              {rollLoading ? 'Fetching suggestions…' : rollOpen ? 'Hide suggestions' : 'Suggest adjustment'}
            </button>
          ) : (
            <span
              title="Requires Pro"
              style={{ fontSize: '12px', color: C.muted, display: 'flex', alignItems: 'center', gap: '5px', cursor: 'default' }}
            >
              🔒 <span>Suggest adjustment — Requires Pro</span>
            </span>
          )}
          {rollAdvisorEnabled && sessionCapped && !rollData && (
            <span style={{ fontSize: '11px', color: C.muted }}>Session limit reached</span>
          )}
        </div>
      )}
      {rollError && (
        <div style={{ fontSize: '12px', color: C.red }}>{rollError}</div>
      )}
      {rollOpen && rollData && <RollAdvisorPanel suggestions={rollData.suggestions} summary={rollData.summary} />}

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {greenSignals.map((s, i) => <SignalRow key={i} signal={s} />)}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '11px', color: C.muted, marginTop: '4px', background: C.surface2, borderRadius: '6px', padding: '8px 10px' }}>
            <span>Quantity: {pos.quantity > 0 ? '+' : ''}{pos.quantity}</span>
            <span>Entry price: ${fmt(pos.avg_cost)}</span>
            <span>Current price: ${fmt(pos.current_price)}</span>
            {pos.iv_environment && <span>IV environment: {pos.iv_environment}</span>}
          </div>
          {pos.risk_level === 'yellow' && <CloseInstructions pos={pos} />}
        </div>
      )}
    </div>
  )
}

interface StrategyGroup {
  key: string
  label: string
  positions: PositionRisk[]
  narrative: Record<string, unknown> | undefined
}

function NarrativePanel({ narrative }: { narrative: Record<string, unknown> }) {
  const profit = narrative.profit_scenario as string | undefined
  const loss = narrative.loss_scenario as string | undefined
  const defensive = narrative.defensive_tactic as string | undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
      {profit && (
        <div style={{ background: '#0f2d1a', border: '1px solid #22c55e44', borderRadius: '6px', padding: '10px 12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>
            IF IT WORKS — PROFIT SCENARIO
          </div>
          <div style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.6 }}>{profit}</div>
        </div>
      )}
      {loss && (
        <div style={{ background: '#2d0f0f', border: '1px solid #ef444444', borderRadius: '6px', padding: '10px 12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>
            IF IT DOESN'T — LOSS SCENARIO
          </div>
          <div style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.6 }}>{loss}</div>
        </div>
      )}
      {defensive && (
        <div style={{ background: '#2d1f0a', border: '1px solid #f59e0b44', borderRadius: '6px', padding: '10px 12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>
            IF IT GOES WRONG — DEFENSIVE TACTIC
          </div>
          <div style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.6 }}>{defensive}</div>
        </div>
      )}
    </div>
  )
}

function StrategyGroupCard({
  group,
  rollAdvisorEnabled,
  sessionClicks,
  onSessionClick,
}: {
  group: StrategyGroup
  rollAdvisorEnabled: boolean
  sessionClicks: number
  onSessionClick: () => void
}) {
  const [narrativeOpen, setNarrativeOpen] = useState(false)

  const riskRank: Record<string, number> = { red: 0, yellow: 1, green: 2 }
  const worstLevel = group.positions.reduce<'green' | 'yellow' | 'red'>((worst, p) => {
    return riskRank[p.risk_level] < riskRank[worst] ? p.risk_level : worst
  }, 'green')
  const combinedPnl = group.positions.reduce((sum, p) => sum + p.pnl, 0)
  const legCount = group.positions.length
  const hasNarrative = !!group.narrative

  const sortedPositions = [...group.positions].sort(
    (a, b) => riskRank[a.risk_level] - riskRank[b.risk_level]
  )

  const isUngrouped = group.key === '_ungrouped'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {/* Strategy group header — only show for named strategies */}
      {!isUngrouped && (
        <div style={{
          background: C.surface2,
          border: `1px solid ${C.border}`,
          borderLeft: `3px solid ${riskColor(worstLevel)}`,
          borderRadius: '8px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap' as const,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{group.label}</span>
              <span style={{
                fontSize: '10px', background: '#1a1440', border: '1px solid #7c6af744',
                color: C.accent, padding: '1px 7px', borderRadius: '8px', fontWeight: 600,
              }}>
                {legCount} leg{legCount !== 1 ? 's' : ''}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: combinedPnl >= 0 ? C.green : C.red }}>
                {combinedPnl >= 0 ? '+' : ''}${fmt(combinedPnl)}
              </span>
              <span style={{
                fontSize: '10px', fontWeight: 700,
                color: riskColor(worstLevel),
                background: riskBg(worstLevel),
                border: `1px solid ${riskColor(worstLevel)}44`,
                padding: '1px 7px', borderRadius: '8px',
                textTransform: 'uppercase' as const,
              }}>
                {riskLabel(worstLevel)}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            {hasNarrative && (
              <button
                onClick={() => setNarrativeOpen(o => !o)}
                style={{
                  background: narrativeOpen ? '#1a1440' : 'transparent',
                  border: `1px solid ${C.accent}66`,
                  borderRadius: '6px',
                  color: C.accent,
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {narrativeOpen ? '▲' : '▼'} Trade Narrative
              </button>
            )}
          </div>
        </div>
      )}

      {/* Narrative panels */}
      {!isUngrouped && narrativeOpen && group.narrative && (
        <div style={{ paddingLeft: '12px' }}>
          <NarrativePanel narrative={group.narrative} />
        </div>
      )}

      {/* Individual leg cards */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px', paddingLeft: isUngrouped ? '0' : '12px' }}>
        {sortedPositions.map((pos, i) => (
          <PositionCard
            key={`${pos.symbol}-${pos.strike}-${pos.expiry}-${pos.option_type}-${i}`}
            pos={pos}
            rollAdvisorEnabled={rollAdvisorEnabled}
            sessionClicks={sessionClicks}
            onSessionClick={onSessionClick}
          />
        ))}
      </div>
    </div>
  )
}

export default function RiskMonitor() {
  const { entitlements } = useEntitlements()
  const [data, setData] = useState<PositionRisk[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState('')
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  // E5: session-level roll advisor click counter (max 5)
  const [rollSessionClicks, setRollSessionClicks] = useState(0)

  const rollAdvisorEnabled = entitlements?.features?.roll_advisor ?? false

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
  useEffect(() => {
    getAISettings().then(s => setAiEnabled(s.risk_summary_enabled)).catch(() => {})
  }, [])

  const fetchAISummary = async () => {
    setAiLoading(true)
    setAiError('')
    setAiSummary(null)
    try {
      const result = await aiRiskSummary(data)
      setAiSummary(result.summary || 'No summary available.')
    } catch (e: any) {
      setAiError(e?.response?.data?.detail || 'AI summary failed — please try again.')
    } finally {
      setAiLoading(false)
    }
  }

  const redCount = data.filter(p => p.risk_level === 'red').length
  const yellowCount = data.filter(p => p.risk_level === 'yellow').length
  const greenCount = data.filter(p => p.risk_level === 'green').length
  const totalPnl = data.reduce((sum, p) => sum + p.pnl, 0)

  // Group positions by strategy_key; ungrouped positions use '_ungrouped' key
  const groups: StrategyGroup[] = (() => {
    const groupMap = new Map<string, StrategyGroup>()
    for (const pos of data) {
      const key = pos.strategy_key || '_ungrouped'
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          key,
          label: pos.strategy_name || key,
          positions: [],
          narrative: pos.narrative,
        })
      }
      const g = groupMap.get(key)!
      g.positions.push(pos)
      // Use the first non-null narrative found in the group
      if (!g.narrative && pos.narrative) g.narrative = pos.narrative
    }
    // Sort groups by worst risk level
    const riskRank: Record<string, number> = { red: 0, yellow: 1, green: 2 }
    return [...groupMap.values()].sort((a, b) => {
      const aWorst = a.positions.reduce<number>((w, p) => Math.min(w, riskRank[p.risk_level]), 2)
      const bWorst = b.positions.reduce<number>((w, p) => Math.min(w, riskRank[p.risk_level]), 2)
      return aWorst - bWorst
    })
  })()

  return (
    <div style={{ marginTop: '16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>Risk Monitor</div>
            {redCount > 0 && <span style={{ fontSize: '11px', color: C.red, fontWeight: 700 }}>🔴 HIGH RISK</span>}
          </div>
          <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>Watches each open trade for time decay, P&L thresholds, volatility shifts, and market direction changes</div>
        </div>
        {lastUpdated && <span style={{ fontSize: '10px', color: C.muted }}>{refreshing ? 'Updating…' : lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        <button onClick={() => load(true)} disabled={refreshing || loading} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '6px', color: C.muted, padding: '3px 8px', fontSize: '11px', cursor: 'pointer', opacity: refreshing ? 0.5 : 1 }}>Refresh</button>
      </div>

      {/* Summary stat panels */}
      {!loading && data.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
          {([
            { label: 'Portfolio P&L', value: `${totalPnl >= 0 ? '+' : ''}$${fmt(totalPnl)}`, color: totalPnl >= 0 ? C.green : C.red, bg: C.surface2, border: C.border },
            { label: 'Positions', value: String(data.length), color: C.text, bg: C.surface2, border: C.border },
            { label: '🔴 High Risk', value: String(redCount), color: redCount > 0 ? C.red : C.muted, bg: redCount > 0 ? '#2d0a0a' : C.surface2, border: redCount > 0 ? C.red + '33' : C.border },
            { label: '🟡 Watch', value: String(yellowCount), color: yellowCount > 0 ? C.yellow : C.muted, bg: yellowCount > 0 ? '#2a2000' : C.surface2, border: yellowCount > 0 ? C.yellow + '33' : C.border },
            { label: '🟢 In the money', value: String(greenCount), color: greenCount > 0 ? C.green : C.muted, bg: greenCount > 0 ? '#0a2d14' : C.surface2, border: greenCount > 0 ? C.green + '33' : C.border },
          ] as const).map(p => (
            <div key={p.label} style={{ background: p.bg, border: `1px solid ${p.border}`, borderRadius: '6px', padding: '6px 12px', whiteSpace: 'nowrap' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>{p.label}</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: p.color, lineHeight: 1 }}>{p.value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading && <div style={{ color: C.muted, fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>Analysing your positions…</div>}
        {!loading && error && <div style={{ color: C.red, fontSize: '12px', padding: '10px' }}>{error}</div>}
        {!loading && !error && data.length === 0 && <div style={{ color: C.muted, fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>No open positions to monitor</div>}
        {!loading && data.length > 0 && groups.map(group => (
          <StrategyGroupCard
            key={group.key}
            group={group}
            rollAdvisorEnabled={rollAdvisorEnabled}
            sessionClicks={rollSessionClicks}
            onSessionClick={() => setRollSessionClicks(n => n + 1)}
          />
        ))}
        {!loading && data.length > 0 && aiEnabled && (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={fetchAISummary}
              disabled={aiLoading}
              style={{
                background: 'transparent', border: `1px solid ${C.accent}`, borderRadius: '6px',
                color: C.accent, padding: '8px 16px', fontSize: '12px', fontWeight: 700,
                cursor: aiLoading ? 'default' : 'pointer', opacity: aiLoading ? 0.6 : 1,
                display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-start',
              }}
            >
              <span style={{ fontSize: '14px' }}>✦</span>
              {aiLoading ? 'Analysing portfolio…' : aiSummary ? 'Refresh AI Overview' : 'Get AI Risk Overview'}
            </button>
            {aiError && <div style={{ fontSize: '12px', color: C.red }}>{aiError}</div>}
            {aiSummary && (
              <div style={{
                background: '#1a1440', border: `1px solid ${C.accent}44`, borderRadius: '8px',
                padding: '12px 14px', fontSize: '13px', color: C.text, lineHeight: 1.7,
              }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                  ✦ AI Risk Overview
                </div>
                {aiSummary}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
