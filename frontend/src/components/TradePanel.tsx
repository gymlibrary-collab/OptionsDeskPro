import { useState, useEffect } from 'react'
import {
  TradeStructure, TradeLeg, recordTrade,
  getAISettings, analyzeSymbol, aiStrategyReasoning, aiEnhanceNarrative,
} from '../api/client'

interface Props {
  symbol: string
  trade: TradeStructure
  onRecorded: () => void
  onClose: () => void
}

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  surface2: '#252836',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#64748b',
  accent: '#7c6af7',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#f59e0b',
  blue: '#3b82f6',
}

function fmt(n: number | null | undefined, d = 2): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function dte(expiry: string): number {
  const diff = new Date(expiry + 'T00:00:00').getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86400000))
}

function LegRow({ leg, qty }: { leg: TradeLeg; qty: number }) {
  const isBuy = leg.action === 'buy'
  const typeColor = leg.option_type === 'call' ? C.blue : '#a855f7'
  return (
    <tr style={{ borderBottom: `1px solid ${C.border}22` }}>
      <td style={{ padding: '6px 8px', color: C.muted, fontSize: '11px', whiteSpace: 'nowrap' }}>{leg.role.replace(/ [12]$/, '')}</td>
      <td style={{ padding: '6px 8px', color: typeColor, fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
        {leg.option_type}
      </td>
      <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums', color: qty > 1 ? C.accent : C.muted, fontWeight: qty > 1 ? 700 : 400, fontSize: '11px' }}>
        {qty}
      </td>
      <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums', color: C.text, fontWeight: 600 }}>
        ${fmt(leg.strike, 0)}
      </td>
      <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums', color: C.muted, fontSize: '11px' }}>
        {fmt(leg.bid)}
      </td>
      <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums', color: C.muted, fontSize: '11px' }}>
        {fmt(leg.ask)}
      </td>
      <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums', color: C.text, fontWeight: 600 }}>
        {fmt(leg.mid)}
      </td>
      <td style={{ padding: '6px 8px' }}>
        <span style={{
          background: isBuy ? '#0f2d1a' : '#2d0f0f',
          color: isBuy ? C.green : C.red,
          border: `1px solid ${isBuy ? C.green : C.red}44`,
          borderRadius: '3px',
          padding: '1px 5px',
          fontSize: '10px',
          fontWeight: 700,
          textTransform: 'uppercase',
        }}>
          {leg.action}
        </span>
      </td>
    </tr>
  )
}

export default function TradePanel({ symbol, trade, onRecorded, onClose }: Props) {
  const [multiplier, setMultiplier] = useState(1)
  const [recording, setRecording] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [aiNarrativeEnabled, setAiNarrativeEnabled] = useState(false)
  const [aiReasoningEnabled, setAiReasoningEnabled] = useState(false)
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const fetchAIInsight = async (useReasoning?: boolean) => {
    setAiLoading(true)
    setAiError('')
    setAiInsight(null)
    const reasoning = useReasoning ?? aiReasoningEnabled
    try {
      const analysis = await analyzeSymbol(symbol)
      const payload = {
        symbol,
        iv_analysis: analysis.iv_analysis,
        bias_analysis: analysis.bias_analysis,
        strategy: {
          name: trade.strategy,
          strategy_key: trade.strategy_key,
          fit_score: 0,
          pop_range: [trade.pop_estimate ?? 50, trade.pop_estimate ?? 70],
        },
        trade: {
          estimated_credit_or_debit: trade.estimated_credit_or_debit,
          expiry: trade.expiry,
          max_profit: trade.max_profit,
          max_loss: trade.max_loss,
        },
      }
      if (reasoning) {
        const res = await aiStrategyReasoning(payload.symbol, payload.iv_analysis, payload.bias_analysis, payload.strategy, payload.trade)
        setAiInsight(res.reasoning || 'No insight available.')
      } else {
        const res = await aiEnhanceNarrative(payload.symbol, payload.iv_analysis, payload.bias_analysis, payload.strategy, payload.trade)
        setAiInsight(res.insight || 'No insight available.')
      }
    } catch (e: any) {
      setAiError(e?.response?.data?.detail || 'AI insight failed — please try again.')
    } finally {
      setAiLoading(false)
    }
  }

  useEffect(() => {
    getAISettings().then(s => {
      setAiNarrativeEnabled(s.narrative_enabled)
      setAiReasoningEnabled(s.strategy_reasoning_enabled)
      if (s.narrative_enabled || s.strategy_reasoning_enabled) {
        fetchAIInsight(s.strategy_reasoning_enabled)
      }
    }).catch(() => {})
  }, [symbol, trade.strategy_key])

  const isCredit = trade.estimated_credit_or_debit >= 0
  const netPerSpread = Math.abs(trade.estimated_credit_or_debit)
  const daysLeft = dte(trade.expiry)

  // Collapse duplicate legs (same strike + action + option_type) into one entry with qty.
  type DisplayLeg = TradeLeg & { qty: number }
  const optionLegs: DisplayLeg[] = []
  for (const leg of trade.legs.filter(l => l.option_type !== 'stock')) {
    const existing = optionLegs.find(
      d => d.option_type === leg.option_type && d.strike === leg.strike && d.action === leg.action
    )
    if (existing) { existing.qty += 1 } else { optionLegs.push({ ...leg, qty: 1 }) }
  }

  const handleRecord = async () => {
    setRecording(true)
    setFeedback(null)
    try {
      const legs = optionLegs.map(leg => ({
        role: leg.role.replace(/ [12]$/, ''),
        option_type: leg.option_type,
        strike: leg.strike,
        action: leg.action,
        quantity: leg.qty * multiplier,
        price: leg.mid > 0 ? leg.mid : ((leg.bid + leg.ask) / 2),
      }))
      const result = await recordTrade({
        symbol,
        strategy_key: trade.strategy_key,
        strategy_name: trade.strategy,
        expiry: trade.expiry,
        profit_target_pct: trade.profit_target_pct,
        legs,
        narrative_json: trade.narrative as Record<string, unknown> | undefined,
      })
      setFeedback({ ok: true, msg: `Recorded ${result.recorded} leg${result.recorded !== 1 ? 's' : ''} — ${result.strategy}` })
      onRecorded()
    } catch (e: any) {
      setFeedback({ ok: false, msg: e?.response?.data?.detail || e?.message || 'Record failed' })
    } finally {
      setRecording(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px 12px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
            <span style={{
              background: C.accent + '22',
              color: C.accent,
              border: `1px solid ${C.accent}44`,
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '13px',
              fontWeight: 800,
              letterSpacing: '0.05em',
            }}>{symbol}</span>
            <span style={{
              background: trade.risk_type === 'DEFINED' ? '#0d1a2d' : '#2d1a0d',
              color: trade.risk_type === 'DEFINED' ? C.blue : C.yellow,
              border: `1px solid ${trade.risk_type === 'DEFINED' ? C.blue : C.yellow}44`,
              borderRadius: '3px',
              padding: '1px 5px',
              fontSize: '10px',
              fontWeight: 700,
            }}>{trade.risk_type}</span>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{trade.strategy}</div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: '20px', cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
        >×</button>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'flex', gap: '0', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {[
          { label: 'Expiry', value: trade.expiry },
          { label: 'DTE', value: `${daysLeft}d` },
          { label: 'POP', value: trade.pop_estimate != null ? `${trade.pop_estimate}%` : '—' },
        ].map((s, i) => (
          <div key={s.label} style={{
            flex: 1, padding: '8px 10px',
            borderRight: i < 2 ? `1px solid ${C.border}` : 'none',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: C.text, marginTop: '1px', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Legs table */}
        <div>
          <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Legs</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Role', 'Type', 'Qty', 'Strike', 'Bid', 'Ask', 'Mid', 'Action'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '4px 8px',
                      color: C.muted, fontWeight: 600, fontSize: '10px',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {optionLegs.map((leg, i) => <LegRow key={i} leg={leg} qty={leg.qty} />)}
              </tbody>
            </table>
          </div>
        </div>

        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {[
            { label: isCredit ? 'Est. Credit' : 'Est. Debit', value: `$${fmt(netPerSpread)}`, color: isCredit ? C.green : C.red, sub: 'per spread' },
            { label: 'Max Profit', value: trade.max_profit != null ? `$${fmt(trade.max_profit)}` : 'Unlimited', color: C.green, sub: 'per contract' },
            { label: 'Max Loss', value: trade.max_loss != null ? `$${fmt(trade.max_loss)}` : 'Undefined', color: C.red, sub: 'per contract' },
            { label: 'TT Target', value: trade.tastylive_profit_target != null ? `$${fmt(trade.tastylive_profit_target)}` : trade.max_profit == null ? 'Close at 21 DTE' : `${trade.profit_target_pct}% of max`, color: C.yellow, sub: trade.tastylive_profit_target != null ? `${trade.profit_target_pct}% of max` : trade.max_profit == null ? 'Unlimited upside' : '' },
          ].map(m => (
            <div key={m.label} style={{ background: C.surface2, borderRadius: '6px', padding: '8px 10px' }}>
              <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>{m.label}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: m.color, fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
              {m.sub && <div style={{ fontSize: '10px', color: C.muted }}>{m.sub}</div>}
            </div>
          ))}
        </div>

        {/* Breakevens */}
        {(trade.breakeven_low != null || trade.breakeven_high != null) && (
          <div style={{ fontSize: '12px', color: C.muted }}>
            Breakeven{trade.breakeven_high != null ? 's' : ''}:{' '}
            {trade.breakeven_low != null && <span style={{ color: C.text, fontWeight: 600 }}>${fmt(trade.breakeven_low)}</span>}
            {trade.breakeven_low != null && trade.breakeven_high != null && <span style={{ margin: '0 6px' }}>–</span>}
            {trade.breakeven_high != null && <span style={{ color: C.text, fontWeight: 600 }}>${fmt(trade.breakeven_high)}</span>}
          </div>
        )}

        {/* Multiplier */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '12px' }}>
          <label style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
            Number of Spreads
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => setMultiplier(m => Math.max(1, m - 1))} style={{ width: '32px', height: '32px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontSize: '16px', cursor: 'pointer' }}>−</button>
            <input
              type="number" min="1" value={multiplier}
              onChange={e => setMultiplier(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ flex: 1, background: C.surface2, border: `1px solid #3a3f5c`, borderRadius: '6px', color: C.text, padding: '6px 10px', fontSize: '14px', fontWeight: 700, textAlign: 'center', outline: 'none' }}
            />
            <button onClick={() => setMultiplier(m => m + 1)} style={{ width: '32px', height: '32px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontSize: '16px', cursor: 'pointer' }}>+</button>
          </div>
          {multiplier > 1 && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: C.muted }}>
              Total {isCredit ? 'credit' : 'debit'}:{' '}
              <span style={{ color: isCredit ? C.green : C.red, fontWeight: 700 }}>${fmt(netPerSpread * multiplier * 100, 0)}</span>
              <span style={{ color: C.muted }}> ({multiplier} × ${fmt(netPerSpread)} × 100)</span>
            </div>
          )}
        </div>

        {/* Record button */}
        <button
          onClick={handleRecord}
          disabled={recording || !!feedback?.ok}
          style={{
            padding: '12px', borderRadius: '8px', border: 'none',
            background: feedback?.ok ? C.green : C.accent,
            color: '#fff', fontSize: '13px', fontWeight: 700,
            cursor: recording || feedback?.ok ? 'default' : 'pointer',
            opacity: recording ? 0.7 : 1, letterSpacing: '0.04em', transition: 'background 0.2s',
          }}
        >
          {recording ? 'Recording…' : feedback?.ok ? 'Recorded ✓' : 'Confirm & Record Trade'}
        </button>

        {feedback && (
          <div style={{
            padding: '10px 12px', borderRadius: '6px', fontSize: '12px',
            background: feedback.ok ? '#0f2d1a' : '#2d0f0f',
            border: `1px solid ${feedback.ok ? C.green : C.red}44`,
            color: feedback.ok ? C.green : C.red,
          }}>
            {feedback.msg}
          </div>
        )}

        {(aiNarrativeEnabled || aiReasoningEnabled) && (aiLoading || aiInsight || aiError) && (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {aiLoading && (
              <div style={{ fontSize: '12px', color: C.muted }}>✦ Generating AI insight…</div>
            )}
            {aiError && <div style={{ fontSize: '12px', color: C.red }}>{aiError}</div>}
            {aiInsight && (
              <div style={{
                background: '#1a1440', border: `1px solid ${C.accent}44`, borderRadius: '8px',
                padding: '12px 14px', fontSize: '12px', color: C.text, lineHeight: 1.7,
              }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                  ✦ {aiReasoningEnabled ? 'Strategy Reasoning' : 'AI Coach Insight'}
                </div>
                {aiInsight}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
