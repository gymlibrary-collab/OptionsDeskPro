import { useState, useEffect } from 'react'
import {
  analyzeSymbol,
  AnalyzeSymbolResponse,
  TradeStructure,
  TradeLeg,
  StrategyRecommendation,
} from '../api/client'
import { OrderPrefill } from '../App'
import StrategyNarrative from './StrategyNarrative'

interface Props {
  symbol: string
  onAddToOrder?: (prefill: OrderPrefill) => void
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

function IVRGauge({ rank }: { rank: number }) {
  const pct = Math.max(0, Math.min(100, rank))
  const color = pct > 50 ? C.red : pct < 30 ? C.green : C.yellow
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 120 }}>
      <div style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        IV Rank
      </div>
      <div style={{ background: C.surface2, borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.5s', borderRadius: '4px' }} />
      </div>
      <div style={{ fontSize: '20px', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {pct.toFixed(0)}
      </div>
    </div>
  )
}

function IVEnvBadge({ env }: { env: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    HIGH: { bg: '#2d0f0f', color: C.red },
    MEDIUM: { bg: '#2d1f0f', color: C.yellow },
    LOW: { bg: '#0f2d1a', color: C.green },
  }
  const style = map[env] || { bg: C.surface2, color: C.muted }
  return (
    <span style={{
      background: style.bg,
      color: style.color,
      border: `1px solid ${style.color}33`,
      borderRadius: '4px',
      padding: '2px 8px',
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.05em',
    }}>
      {env}
    </span>
  )
}

function BiasBadge({ bias, strength }: { bias: string; strength: string }) {
  const isBull = bias.includes('BULLISH')
  const isBear = bias.includes('BEARISH')
  const color = isBull ? C.green : isBear ? C.red : C.yellow
  const arrow = isBull ? '▲' : isBear ? '▼' : '◆'
  const label = bias.replace('_', ' ')
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color, fontSize: '13px', fontWeight: 700 }}>
      {arrow} {label}
      {strength === 'STRONG' && (
        <span style={{ fontSize: '10px', background: `${color}22`, border: `1px solid ${color}55`, borderRadius: '3px', padding: '1px 4px' }}>
          STRONG
        </span>
      )}
    </span>
  )
}

function RiskBadge({ type }: { type: string }) {
  const isDefined = type === 'DEFINED'
  return (
    <span style={{
      background: isDefined ? '#0d1a2d' : '#2d1a0d',
      color: isDefined ? C.blue : C.yellow,
      border: `1px solid ${isDefined ? C.blue : C.yellow}44`,
      borderRadius: '4px',
      padding: '2px 7px',
      fontSize: '11px',
      fontWeight: 700,
    }}>
      {type}
    </span>
  )
}

function ComplexityDots({ level }: { level: number }) {
  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: i <= level ? C.accent : C.surface2,
          border: `1px solid ${C.border}`,
        }} />
      ))}
    </div>
  )
}

function LegsTable({ legs, expiry, symbol, onAddToOrder }: {
  legs: TradeLeg[]
  expiry: string
  symbol: string
  onAddToOrder?: (prefill: OrderPrefill) => void
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
      <thead>
        <tr>
          {['Role', 'Type', 'Strike', 'Delta', 'Bid', 'Ask', 'Mid', 'Action'].map(h => (
            <th key={h} style={{
              textAlign: 'left', padding: '5px 8px',
              color: C.muted, fontWeight: 600,
              fontSize: '10px', textTransform: 'uppercase',
              letterSpacing: '0.05em',
              borderBottom: `1px solid ${C.border}`,
            }}>{h}</th>
          ))}
          {onAddToOrder && <th style={{ color: C.muted, fontSize: '10px', borderBottom: `1px solid ${C.border}` }} />}
        </tr>
      </thead>
      <tbody>
        {legs.map((leg, i) => {
          const isBuy = leg.action === 'buy'
          const isStock = leg.option_type === 'stock'
          return (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}22` }}>
              <td style={{ padding: '5px 8px', color: C.muted, fontSize: '11px' }}>{leg.role}</td>
              <td style={{ padding: '5px 8px', color: leg.option_type === 'call' ? C.blue : leg.option_type === 'put' ? '#a855f7' : C.muted, fontWeight: 600, textTransform: 'uppercase', fontSize: '11px' }}>
                {leg.option_type}
              </td>
              <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums', color: C.text }}>
                {isStock ? `$${fmt(leg.strike)}` : fmt(leg.strike, 0)}
              </td>
              <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums', color: C.muted }}>
                {isStock ? '1.00' : fmt(leg.delta, 2)}
              </td>
              <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums', color: C.muted }}>
                {isStock ? '—' : `$${fmt(leg.bid)}`}
              </td>
              <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums', color: C.muted }}>
                {isStock ? '—' : `$${fmt(leg.ask)}`}
              </td>
              <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums', color: C.text, fontWeight: 600 }}>
                {isStock ? `$${fmt(leg.mid)}` : `$${fmt(leg.mid)}`}
              </td>
              <td style={{ padding: '5px 8px' }}>
                <span style={{
                  background: isBuy ? '#0f2d1a' : '#2d0f0f',
                  color: isBuy ? C.green : C.red,
                  border: `1px solid ${isBuy ? C.green : C.red}44`,
                  borderRadius: '3px',
                  padding: '1px 6px',
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}>
                  {leg.action}
                </span>
              </td>
              {onAddToOrder && !isStock && (
                <td style={{ padding: '5px 4px' }}>
                  <button
                    onClick={() => onAddToOrder({
                      symbol,
                      expiry,
                      strike: leg.strike,
                      option_type: leg.option_type as 'call' | 'put',
                      bid: leg.bid,
                      ask: leg.ask,
                    })}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${C.accent}`,
                      color: C.accent,
                      borderRadius: '3px',
                      padding: '2px 6px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    + Order
                  </button>
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function TradeCard({
  tradeEntry, symbol, onAddToOrder,
}: {
  tradeEntry: { strategy_key: string; strategy_name: string; trade: TradeStructure }
  symbol: string
  onAddToOrder?: (prefill: OrderPrefill) => void
}) {
  const { trade } = tradeEntry
  const isCredit = trade.estimated_credit_or_debit >= 0

  if (trade.error) {
    return (
      <div style={{
        background: '#2d0f0f', border: `1px solid ${C.red}44`,
        borderRadius: '6px', padding: '12px', fontSize: '12px', color: C.red,
      }}>
        Trade build failed: {trade.error}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ overflowX: 'auto' }}>
        <LegsTable legs={trade.legs} expiry={trade.expiry} symbol={symbol} onAddToOrder={onAddToOrder} />
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px' }}>
        <div style={{ background: C.surface2, borderRadius: '6px', padding: '8px 12px', flex: 1, minWidth: 100 }}>
          <div style={{ color: C.muted, fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>
            {isCredit ? 'Est. Credit' : 'Est. Debit'}
          </div>
          <div style={{ color: isCredit ? C.green : C.red, fontWeight: 700, fontSize: '16px', fontVariantNumeric: 'tabular-nums' }}>
            ${fmt(Math.abs(trade.estimated_credit_or_debit))}
          </div>
          <div style={{ color: C.muted, fontSize: '10px' }}>per contract</div>
        </div>

        <div style={{ background: C.surface2, borderRadius: '6px', padding: '8px 12px', flex: 1, minWidth: 100 }}>
          <div style={{ color: C.muted, fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>Max Profit</div>
          <div style={{ color: C.green, fontWeight: 700, fontSize: '16px', fontVariantNumeric: 'tabular-nums' }}>
            {trade.max_profit != null ? `$${fmt(trade.max_profit)}` : 'Unlimited'}
          </div>
        </div>

        <div style={{ background: C.surface2, borderRadius: '6px', padding: '8px 12px', flex: 1, minWidth: 100 }}>
          <div style={{ color: C.muted, fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>Max Loss</div>
          <div style={{ color: C.red, fontWeight: 700, fontSize: '16px', fontVariantNumeric: 'tabular-nums' }}>
            {trade.max_loss != null ? `$${fmt(trade.max_loss)}` : 'Undefined'}
          </div>
        </div>

        <div style={{ background: C.surface2, borderRadius: '6px', padding: '8px 12px', flex: 1, minWidth: 100 }}>
          <div style={{ color: C.muted, fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>PoP Est.</div>
          <div style={{ color: C.accent, fontWeight: 700, fontSize: '16px', fontVariantNumeric: 'tabular-nums' }}>
            {trade.pop_estimate != null ? `${trade.pop_estimate}%` : '—'}
          </div>
        </div>

        {trade.tastylive_profit_target != null && (
          <div style={{ background: C.surface2, borderRadius: '6px', padding: '8px 12px', flex: 1, minWidth: 100 }}>
            <div style={{ color: C.muted, fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>TT Target</div>
            <div style={{ color: C.yellow, fontWeight: 700, fontSize: '16px', fontVariantNumeric: 'tabular-nums' }}>
              ${fmt(trade.tastylive_profit_target)}
            </div>
            <div style={{ color: C.muted, fontSize: '10px' }}>{trade.profit_target_pct}% of max</div>
          </div>
        )}
      </div>

      {(trade.breakeven_low != null || trade.breakeven_high != null) && (
        <div style={{ fontSize: '11px', color: C.muted }}>
          Breakevens:{' '}
          {trade.breakeven_low != null && <span style={{ color: C.text }}>Low ${fmt(trade.breakeven_low)}</span>}
          {trade.breakeven_low != null && trade.breakeven_high != null && '  /  '}
          {trade.breakeven_high != null && <span style={{ color: C.text }}>High ${fmt(trade.breakeven_high)}</span>}
        </div>
      )}

      <div style={{ fontSize: '11px', color: C.muted }}>
        Expiry: <span style={{ color: C.text }}>{trade.expiry}</span>
        {' · '}
        Risk: <RiskBadge type={trade.risk_type} />
      </div>

      {trade.narrative && <StrategyNarrative narrative={trade.narrative} />}
    </div>
  )
}

function StrategyCard({
  rec, tradeEntry, symbol, onAddToOrder,
}: {
  rec: StrategyRecommendation
  tradeEntry?: { strategy_key: string; strategy_name: string; trade: TradeStructure }
  symbol: string
  onAddToOrder?: (prefill: OrderPrefill) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: '12px 16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: C.text, fontSize: '14px' }}>{rec.name}</span>
            <RiskBadge type={rec.risk_type} />
            <ComplexityDots level={rec.complexity} />
          </div>
          <div style={{ color: C.muted, fontSize: '12px', marginTop: '4px' }}>{rec.description}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
          <div style={{ color: C.accent, fontSize: '13px', fontWeight: 700 }}>
            PoP {rec.pop_range[0]}–{rec.pop_range[1]}%
          </div>
          <div style={{ color: C.muted, fontSize: '11px' }}>
            Target {rec.profit_target_pct}% · {rec.dte_target}d
          </div>
          <div style={{ color: C.muted, fontSize: '11px' }}>
            {expanded ? '▲ collapse' : '▼ trade'}
          </div>
        </div>
      </div>

      {expanded && tradeEntry && (
        <div style={{
          borderTop: `1px solid ${C.border}`,
          padding: '12px 16px',
          background: C.bg,
        }}>
          <TradeCard tradeEntry={tradeEntry} symbol={symbol} onAddToOrder={onAddToOrder} />
        </div>
      )}

      {expanded && !tradeEntry && (
        <div style={{
          borderTop: `1px solid ${C.border}`,
          padding: '12px 16px',
          color: C.muted,
          fontSize: '12px',
        }}>
          No trade structure available for this strategy.
        </div>
      )}
    </div>
  )
}

export default function StrategyDetail({ symbol, onAddToOrder }: Props) {
  const [data, setData] = useState<AnalyzeSymbolResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    setError(null)
    setData(null)
    analyzeSymbol(symbol)
      .then(setData)
      .catch(e => setError(e?.response?.data?.detail || e?.message || 'Analysis failed'))
      .finally(() => setLoading(false))
  }, [symbol])

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: C.muted }}>
        Analyzing {symbol}...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '16px', color: C.red, background: '#2d0f0f', borderRadius: '8px', margin: '16px' }}>
        {error}
      </div>
    )
  }

  if (!data) return null

  const { iv_analysis: iv, bias_analysis: bias, recommendations, trades } = data
  const tradeMap = new Map(trades.map(t => [t.strategy_key, t]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '8px',
        padding: '16px',
        display: 'flex',
        gap: '24px',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
      }}>
        <div>
          <div style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Symbol</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: C.text }}>{data.symbol}</div>
          <div style={{ fontSize: '18px', color: C.accent, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            ${fmt(bias.price)}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <IVRGauge rank={iv.iv_rank} />
          <IVEnvBadge env={iv.iv_environment} />
          <div style={{ fontSize: '11px', color: C.muted }}>{iv.percentile_label}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
              Directional Bias
            </div>
            <BiasBadge bias={bias.bias} strength={bias.strength} />
          </div>
          <div style={{ fontSize: '12px', color: C.muted }}>
            RSI(14): <span style={{ color: bias.rsi14 > 60 ? C.green : bias.rsi14 < 40 ? C.red : C.text }}>{fmt(bias.rsi14, 1)}</span>
          </div>
          <div style={{ fontSize: '12px', color: C.muted }}>
            SMA20: <span style={{ color: C.text }}>${fmt(bias.sma20)}</span>
            {' · '}
            SMA50: <span style={{ color: C.text }}>${fmt(bias.sma50)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
          <div style={{ color: C.muted, textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.08em', marginBottom: '2px' }}>IV Details</div>
          <div style={{ color: C.muted }}>
            Current IV: <span style={{ color: C.text }}>{((iv.current_iv || 0) * 100).toFixed(1)}%</span>
          </div>
          <div style={{ color: C.muted }}>
            HV 30d: <span style={{ color: C.text }}>{((iv.hv_30d || 0) * 100).toFixed(1)}%</span>
          </div>
          <div style={{ color: C.muted }}>
            52wk HV range: <span style={{ color: C.text }}>
              {((iv.hv_52wk_low || 0) * 100).toFixed(1)}% – {((iv.hv_52wk_high || 0) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Recommended Strategies */}
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
          Recommended Strategies ({recommendations.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {recommendations.length === 0 && (
            <div style={{ color: C.muted, fontSize: '13px' }}>No strategies matched current conditions.</div>
          )}
          {recommendations.map(rec => (
            <StrategyCard
              key={rec.key}
              rec={rec}
              tradeEntry={tradeMap.get(rec.key)}
              symbol={data.symbol}
              onAddToOrder={onAddToOrder}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
