import { useState, useEffect, useCallback } from 'react'
import {
  analyzeSymbol,
  AnalyzeSymbolResponse,
  TradeStructure,
  TradeLeg,
  StrategyRecommendation,
  NewsSentiment,
  MatrixRow,
} from '../api/client'
import StrategyNarrative from './StrategyNarrative'
import { useEntitlements } from '../context/EntitlementsContext'

interface Props {
  symbol: string
  onSelectTrade?: (symbol: string, trade: TradeStructure) => void
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
  purple: '#a855f7',
}

const CATEGORY_META: Record<string, { label: string; color: string; icon: string; subtitle: string }> = {
  BULLISH: {
    label: 'Bullish Strategies',
    color: C.green,
    icon: '▲',
    subtitle: 'Profit when the stock rises',
  },
  BEARISH: {
    label: 'Bearish Strategies',
    color: C.red,
    icon: '▼',
    subtitle: 'Profit when the stock falls',
  },
  NEUTRAL: {
    label: 'Neutral Strategies',
    color: C.yellow,
    icon: '◆',
    subtitle: 'Profit when the stock stays range-bound — lose on big moves in either direction',
  },
  NEUTRAL_BULLISH: {
    label: 'Neutral-Bullish Strategies',
    color: '#4ade80',
    icon: '◈',
    subtitle: 'Bullish lean, but structured to win even without a strong move',
  },
  NEUTRAL_BEARISH: {
    label: 'Neutral-Bearish Strategies',
    color: '#f97316',
    icon: '◈',
    subtitle: 'Bearish lean, but structured to win even without a strong move',
  },
  OMNIDIRECTIONAL: {
    label: 'Omnidirectional Strategies',
    color: C.purple,
    icon: '⬡',
    subtitle: 'Profitable regardless of direction — no single directional assumption required',
  },
}

const CATEGORY_ORDER = ['BULLISH', 'BEARISH', 'NEUTRAL', 'NEUTRAL_BULLISH', 'NEUTRAL_BEARISH', 'OMNIDIRECTIONAL']

function fmt(n: number | null | undefined, d = 2): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function IVRGauge({ rank }: { rank: number }) {
  const pct = Math.max(0, Math.min(100, rank))
  const color = pct > 50 ? C.red : pct < 30 ? C.green : C.yellow
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 120 }}>
      <div style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>IV Rank</div>
      <div style={{ background: C.surface2, borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.5s', borderRadius: '4px' }} />
      </div>
      <div style={{ fontSize: '20px', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{pct.toFixed(0)}</div>
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
      background: style.bg, color: style.color,
      border: `1px solid ${style.color}33`, borderRadius: '4px',
      padding: '2px 8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em',
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
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color, fontSize: '13px', fontWeight: 700 }}>
      {arrow} {bias.replace('_', ' ')}
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
      borderRadius: '4px', padding: '2px 7px', fontSize: '11px', fontWeight: 700,
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

function LegsTable({ legs }: { legs: TradeLeg[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
      <thead>
        <tr>
          {['Role', 'Type', 'Strike', 'Delta', 'Bid', 'Ask', 'Mid', 'Action'].map(h => (
            <th key={h} style={{
              textAlign: 'left', padding: '5px 8px', color: C.muted, fontWeight: 600,
              fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em',
              borderBottom: `1px solid ${C.border}`,
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {legs.map((leg, i) => {
          const isBuy = leg.action === 'buy'
          const isStock = leg.option_type === 'stock'
          return (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}22` }}>
              <td style={{ padding: '5px 8px', color: C.muted, fontSize: '11px' }}>{leg.role}</td>
              <td style={{ padding: '5px 8px', color: leg.option_type === 'call' ? C.blue : leg.option_type === 'put' ? C.purple : C.muted, fontWeight: 600, textTransform: 'uppercase', fontSize: '11px' }}>
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
                {`$${fmt(leg.mid)}`}
              </td>
              <td style={{ padding: '5px 8px' }}>
                <span style={{
                  background: isBuy ? '#0f2d1a' : '#2d0f0f',
                  color: isBuy ? C.green : C.red,
                  border: `1px solid ${isBuy ? C.green : C.red}44`,
                  borderRadius: '3px', padding: '1px 6px',
                  fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                }}>
                  {leg.action}
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function TradeInstructions({ trade, symbol }: { trade: TradeStructure; symbol: string }) {
  const isCredit = trade.estimated_credit_or_debit >= 0
  const netDollars = Math.abs(trade.estimated_credit_or_debit) * 100
  const formatExpiry = (e: string) => {
    try { return new Date(e + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return e }
  }

  // Collapse duplicate legs (same strike + action + option_type) into one row with a qty count.
  // ZEBRA back-ratios produce two identical long legs in the backend data; showing them as
  // separate "BUY 1" rows is confusing — a single "BUY 2" row is correct.
  type DisplayLeg = TradeLeg & { qty: number }
  const displayLegs: DisplayLeg[] = []
  for (const leg of trade.legs.filter(l => l.option_type !== 'stock')) {
    const existing = displayLegs.find(
      d => d.option_type === leg.option_type && d.strike === leg.strike && d.action === leg.action
    )
    if (existing) {
      existing.qty += 1
    } else {
      displayLegs.push({ ...leg, qty: 1 })
    }
  }

  return (
    <div style={{ background: '#0d1220', border: `1px solid ${C.accent}44`, borderRadius: '8px', padding: '14px 16px', marginBottom: '4px' }}>
      <div style={{ fontSize: '11px', color: C.accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
        📋 How to place this trade
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
        {displayLegs.map((leg, i) => {
          const isBuy = leg.action === 'buy'
          const legCost = leg.mid * 100 * leg.qty
          const creditDebit = isBuy ? `Pay ~$${legCost.toFixed(0)}` : `Collect ~$${legCost.toFixed(0)}`
          const typeColor = leg.option_type === 'call' ? C.blue : C.purple
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 10px',
              background: isBuy ? '#0f1f0f' : '#1f0f0f',
              borderRadius: '6px',
              border: `1px solid ${isBuy ? C.green : C.red}22`,
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '10px', color: C.muted, width: '16px', flexShrink: 0 }}>{i + 1}.</span>
              <span style={{ background: isBuy ? C.green : C.red, color: '#000', borderRadius: '3px', padding: '2px 7px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', flexShrink: 0 }}>
                {leg.action.toUpperCase()}
              </span>
              <span style={{ fontWeight: 700, color: C.text, fontSize: '13px' }}>{leg.qty} {symbol}</span>
              <span style={{ fontWeight: 700, color: C.text, fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>${leg.strike}</span>
              <span style={{ fontWeight: 700, color: typeColor, fontSize: '13px', textTransform: 'uppercase' }}>{leg.option_type}</span>
              <span style={{ color: C.muted, fontSize: '12px' }}>· expires {formatExpiry(trade.expiry)}</span>
              <span style={{ color: C.muted, fontSize: '11px' }}>· Δ {fmt(leg.delta, 2)}</span>
              <span style={{ marginLeft: 'auto', color: isBuy ? C.red : C.green, fontSize: '12px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {creditDebit}
              </span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '10px 12px', background: C.surface2, borderRadius: '6px', fontSize: '12px' }}>
        <div>
          <span style={{ color: C.muted }}>Net: </span>
          <span style={{ color: isCredit ? C.green : C.red, fontWeight: 700 }}>
            {isCredit ? `Collect $${netDollars.toFixed(0)} credit` : `Pay $${netDollars.toFixed(0)} debit`}
          </span>
          <span style={{ color: C.muted }}> per spread</span>
        </div>
        <div>
          <span style={{ color: C.muted }}>Exit when: </span>
          <span style={{ color: C.yellow, fontWeight: 600 }}>
            {trade.tastylive_profit_target != null
              ? `P&L reaches +$${(trade.tastylive_profit_target * 100).toFixed(0)} (${trade.profit_target_pct}% of max)`
              : trade.max_profit == null
                ? 'Profit is unlimited — close when your thesis plays out or at 21 DTE'
                : `${trade.profit_target_pct}% of max profit`}
          </span>
        </div>
        {trade.breakeven_low != null && trade.breakeven_high != null && (
          <div>
            <span style={{ color: C.muted }}>Profit zone: </span>
            <span style={{ color: C.text, fontWeight: 600 }}>${fmt(trade.breakeven_low)} – ${fmt(trade.breakeven_high)}</span>
          </div>
        )}
        {trade.breakeven_low != null && trade.breakeven_high == null && (
          <div>
            <span style={{ color: C.muted }}>Breakeven: </span>
            <span style={{ color: C.text, fontWeight: 600 }}>${fmt(trade.breakeven_low)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function TradeCard({ rec, symbol, onSelectTrade, newsSentiment }: {
  rec: StrategyRecommendation
  symbol: string
  onSelectTrade?: (symbol: string, trade: TradeStructure) => void
  newsSentiment?: NewsSentiment
}) {
  const trade = rec.trade
  if (!trade) return <div style={{ color: C.muted, fontSize: '12px', padding: '8px' }}>No trade structure available.</div>

  const isCredit = (trade.estimated_credit_or_debit ?? 0) >= 0

  if (trade.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ background: '#2d0f0f', border: `1px solid ${C.red}44`, borderRadius: '6px', padding: '10px 12px', fontSize: '12px', color: C.red }}>
          Live options data unavailable ({trade.error}) — analysis below is based on IV and price action only.
        </div>
        {trade.narrative && <StrategyNarrative narrative={trade.narrative} newsSentiment={newsSentiment} />}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <TradeInstructions trade={trade} symbol={symbol} />
      <div style={{ overflowX: 'auto' }}>
        <LegsTable legs={trade.legs} />
      </div>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px' }}>
        <div style={{ background: C.surface2, borderRadius: '6px', padding: '8px 12px', flex: 1, minWidth: 100 }}>
          <div style={{ color: C.muted, fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>{isCredit ? 'Est. Credit' : 'Est. Debit'}</div>
          <div style={{ color: isCredit ? C.green : C.red, fontWeight: 700, fontSize: '16px', fontVariantNumeric: 'tabular-nums' }}>${fmt(Math.abs(trade.estimated_credit_or_debit))}</div>
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
            <div style={{ color: C.yellow, fontWeight: 700, fontSize: '16px', fontVariantNumeric: 'tabular-nums' }}>${fmt(trade.tastylive_profit_target)}</div>
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
        {' · '}Risk: <RiskBadge type={trade.risk_type} />
      </div>
      {onSelectTrade && (
        <button
          onClick={() => onSelectTrade(symbol, trade)}
          style={{
            padding: '9px 16px', background: C.accent, border: 'none', borderRadius: '6px',
            color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            letterSpacing: '0.03em', alignSelf: 'flex-start',
          }}
        >
          Record Trade →
        </button>
      )}
      {trade.narrative && <StrategyNarrative narrative={trade.narrative} newsSentiment={newsSentiment} />}
    </div>
  )
}

function StrategyCard({ rec, symbol, onSelectTrade, newsSentiment }: {
  rec: StrategyRecommendation
  symbol: string
  onSelectTrade?: (symbol: string, trade: TradeStructure) => void
  newsSentiment?: NewsSentiment
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden' }}>
      <div onClick={() => setExpanded(e => !e)} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
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
          <div style={{ color: C.muted, fontSize: '11px' }}>Target {rec.profit_target_pct}% · {rec.dte_target}d</div>
          <div style={{ color: C.muted, fontSize: '11px' }}>{expanded ? '▲ collapse' : '▼ trade'}</div>
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 16px', background: C.bg }}>
          <TradeCard rec={rec} symbol={symbol} onSelectTrade={onSelectTrade} newsSentiment={newsSentiment} />
        </div>
      )}
    </div>
  )
}

function CategorySection({ category, recs, symbol, onSelectTrade, newsSentiment }: {
  category: string
  recs: StrategyRecommendation[]
  symbol: string
  onSelectTrade?: (symbol: string, trade: TradeStructure) => void
  newsSentiment?: NewsSentiment
}) {
  const [open, setOpen] = useState(false)
  const meta = CATEGORY_META[category] || { label: category, color: C.muted, icon: '●', subtitle: '' }

  return (
    <div style={{ border: `1px solid ${meta.color}33`, borderRadius: '10px', overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '14px 16px', cursor: 'pointer',
          background: `${meta.color}0d`,
          display: 'flex', alignItems: 'center', gap: '12px',
        }}
      >
        <span style={{ fontSize: '16px', color: meta.color }}>{meta.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: meta.color, fontSize: '14px' }}>{meta.label}</div>
          <div style={{ color: C.muted, fontSize: '11px', marginTop: '2px' }}>{meta.subtitle}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <span style={{
            background: `${meta.color}22`, color: meta.color,
            border: `1px solid ${meta.color}44`,
            borderRadius: '12px', padding: '2px 10px',
            fontSize: '11px', fontWeight: 700,
          }}>
            {recs.length} {recs.length === 1 ? 'strategy' : 'strategies'}
          </span>
          <span style={{ color: C.muted, fontSize: '12px' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', background: C.bg }}>
          {recs.length === 0 ? (
            <div style={{ color: C.muted, fontSize: '12px', padding: '8px' }}>
              No strategies available in this category for the current IV environment.
            </div>
          ) : (
            recs.map(rec => (
              <StrategyCard key={rec.key} rec={rec} symbol={symbol} onSelectTrade={onSelectTrade} newsSentiment={newsSentiment} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

type SortKey = 'name' | 'credit_or_debit' | 'direction' | 'risk_type' | 'max_profit' | 'max_loss' | 'net_delta' | 'net_theta' | 'net_vega' | 'pop_range' | 'condition_fit'
type SortDir = 'asc' | 'desc'

function ConditionIndicator({ match, label }: { match: boolean | 'any'; label: string }) {
  const isAny = match === 'any'
  const symbol = isAny ? '~' : match ? '✓' : '✗'
  const color = isAny ? C.yellow : match ? C.green : C.red
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '2px',
      fontSize: '11px', color, fontWeight: 700,
    }}>
      <span style={{ fontSize: '10px', color: C.muted }}>{label}</span>
      {symbol}
    </span>
  )
}

function CreditDebitBadge({ value }: { value: 'credit' | 'debit' }) {
  const isCredit = value === 'credit'
  return (
    <span style={{
      background: isCredit ? '#0f2d1a' : '#2d0f0f',
      color: isCredit ? C.green : C.red,
      border: `1px solid ${isCredit ? C.green : C.red}44`,
      borderRadius: '4px', padding: '2px 7px', fontSize: '11px', fontWeight: 700,
      textTransform: 'capitalize' as const,
    }}>
      {value}
    </span>
  )
}

function fmtCurrency(n: number | null, isLoss = false): string {
  if (n == null) return isLoss ? 'Undefined' : 'Unlimited'
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtGreek(n: number | null): string {
  if (n == null) return '—'
  return n.toFixed(2)
}

function ComparisonMatrix({ rows, symbol, ivEnv }: { rows: MatrixRow[]; symbol: string; ivEnv: string }) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [filterBothMatch, setFilterBothMatch] = useState(false)
  const [filterDirection, setFilterDirection] = useState('All')
  const [filterType, setFilterType] = useState('All')
  const [filterRisk, setFilterRisk] = useState('All')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const hasSynthetic = rows.some(r => r._synthetic)

  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        return key
      }
      setSortDir('asc')
      return key
    })
  }, [])

  const filtered = rows.filter(r => {
    if (filterBothMatch && !(r.iv_condition_match && r.direction_condition_match)) return false
    if (filterDirection !== 'All' && !r.direction.includes(filterDirection)) return false
    if (filterType !== 'All' && r.credit_or_debit !== filterType.toLowerCase()) return false
    if (filterRisk !== 'All' && r.risk_type !== filterRisk) return false
    return true
  })

  const sorted = sortKey == null ? filtered : [...filtered].sort((a, b) => {
    let av: number | string = 0
    let bv: number | string = 0
    if (sortKey === 'name') { av = a.name; bv = b.name }
    else if (sortKey === 'credit_or_debit') { av = a.credit_or_debit; bv = b.credit_or_debit }
    else if (sortKey === 'direction') { av = a.direction[0] ?? ''; bv = b.direction[0] ?? '' }
    else if (sortKey === 'risk_type') { av = a.risk_type; bv = b.risk_type }
    else if (sortKey === 'max_profit') { av = a.max_profit ?? Infinity; bv = b.max_profit ?? Infinity }
    else if (sortKey === 'max_loss') { av = a.max_loss ?? Infinity; bv = b.max_loss ?? Infinity }
    else if (sortKey === 'net_delta') { av = a.net_delta ?? 0; bv = b.net_delta ?? 0 }
    else if (sortKey === 'net_theta') { av = a.net_theta ?? 0; bv = b.net_theta ?? 0 }
    else if (sortKey === 'net_vega') { av = a.net_vega ?? 0; bv = b.net_vega ?? 0 }
    else if (sortKey === 'pop_range') { av = a.pop_range[0]; bv = b.pop_range[0] }
    else if (sortKey === 'condition_fit') {
      av = (a.iv_condition_match ? 1 : 0) + (a.direction_condition_match ? 1 : 0)
      bv = (b.iv_condition_match ? 1 : 0) + (b.direction_condition_match ? 1 : 0)
    }
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    }
    return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })

  const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '8px 10px', color: C.muted, fontWeight: 600,
    fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
    cursor: 'pointer', userSelect: 'none',
  }

  const SortTh = ({ label, colKey }: { label: string; colKey: SortKey }) => (
    <th style={thStyle} onClick={() => handleSort(colKey)}>
      {label}{sortKey === colKey ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  const directions = ['All', ...Array.from(new Set(rows.flatMap(r => r.direction))).sort()]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {hasSynthetic && (
        <div style={{ padding: '8px 12px', background: '#2d1f0f', border: `1px solid ${C.yellow}44`, borderRadius: '6px', fontSize: '12px', color: C.yellow }}>
          Trade data is synthetic — live options chain unavailable.
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ padding: '10px 14px', background: '#0d1220', border: `1px solid ${C.accent}33`, borderRadius: '6px', fontSize: '11px', color: C.muted, lineHeight: 1.5 }}>
        This table shows mathematical strategy properties. It does not constitute investment advice or a recommendation to trade any specific strategy.
      </div>

      {/* Filter controls */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', padding: '8px 0' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.muted, cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={filterBothMatch}
            onChange={e => setFilterBothMatch(e.target.checked)}
            style={{ accentColor: C.accent }}
          />
          Both conditions match
        </label>
        <select
          value={filterDirection}
          onChange={e => setFilterDirection(e.target.value)}
          style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: '5px', padding: '4px 8px', fontSize: '11px' }}
        >
          {directions.map(d => <option key={d} value={d}>{d === 'All' ? 'All Directions' : d.replace('_', ' ')}</option>)}
        </select>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: '5px', padding: '4px 8px', fontSize: '11px' }}
        >
          {['All', 'Credit', 'Debit'].map(t => <option key={t} value={t}>{t === 'All' ? 'All Types' : t}</option>)}
        </select>
        <select
          value={filterRisk}
          onChange={e => setFilterRisk(e.target.value)}
          style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: '5px', padding: '4px 8px', fontSize: '11px' }}
        >
          {['All', 'DEFINED', 'UNDEFINED'].map(r => <option key={r} value={r}>{r === 'All' ? 'All Risk Types' : r}</option>)}
        </select>
        <span style={{ fontSize: '11px', color: C.muted, marginLeft: 'auto' }}>
          {sorted.length} of {rows.length} strategies · {symbol} · {ivEnv} IV
        </span>
      </div>

      {/* Matrix table */}
      <div style={{ overflowX: 'auto', borderRadius: '8px', border: `1px solid ${C.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '900px' }}>
          <thead>
            <tr style={{ background: C.surface2 }}>
              <SortTh label="Strategy" colKey="name" />
              <SortTh label="Type" colKey="credit_or_debit" />
              <SortTh label="Direction" colKey="direction" />
              <SortTh label="Risk" colKey="risk_type" />
              <SortTh label="Max Profit" colKey="max_profit" />
              <SortTh label="Max Loss" colKey="max_loss" />
              <th style={thStyle}>Breakevens</th>
              <SortTh label="Delta" colKey="net_delta" />
              <SortTh label="Theta" colKey="net_theta" />
              <SortTh label="Vega" colKey="net_vega" />
              <SortTh label="PoP" colKey="pop_range" />
              <th
                style={{ ...thStyle, cursor: 'pointer' }}
                onClick={() => handleSort('condition_fit')}
                title="Factual comparison of current market data against each strategy's textbook design criteria. Not a recommendation."
              >
                Condition Fit{sortKey === 'condition_fit' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ padding: '24px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
                  No strategies match the current filters.
                </td>
              </tr>
            ) : (
              sorted.map(row => {
                const isExpanded = expandedRow === row.key
                const ivMatch = row.iv_condition_match
                const dirMatch = row.direction_condition_match

                return (
                  <>
                    <tr
                      key={row.key}
                      style={{
                        borderBottom: `1px solid ${C.border}22`,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.surface2)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 700, color: C.text }}>{row.name}</span>
                          <ComplexityDots level={row.complexity} />
                        </div>
                        <div style={{ fontSize: '10px', color: C.muted, marginTop: '2px' }}>{row.iv_fit_label}</div>
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <CreditDebitBadge value={row.credit_or_debit} />
                      </td>
                      <td style={{ padding: '9px 10px', color: C.muted, fontSize: '11px', whiteSpace: 'nowrap' }}>
                        {row.direction.map(d => d.replace('_', ' ')).join(', ')}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <RiskBadge type={row.risk_type} />
                      </td>
                      <td style={{ padding: '9px 10px', color: C.green, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {fmtCurrency(row.max_profit, false)}
                      </td>
                      <td style={{ padding: '9px 10px', color: row.max_loss == null ? C.yellow : C.red, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {fmtCurrency(row.max_loss, true)}
                      </td>
                      <td style={{ padding: '9px 10px', color: C.muted, fontVariantNumeric: 'tabular-nums', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        {row.breakeven_low != null && row.breakeven_high != null
                          ? `$${fmt(row.breakeven_low)} – $${fmt(row.breakeven_high)}`
                          : row.breakeven_low != null
                            ? `$${fmt(row.breakeven_low)}`
                            : '—'}
                      </td>
                      <td style={{ padding: '9px 10px', color: C.text, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                        {fmtGreek(row.net_delta)}
                      </td>
                      <td style={{ padding: '9px 10px', color: C.text, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                        {fmtGreek(row.net_theta)}
                      </td>
                      <td style={{ padding: '9px 10px', color: C.text, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                        {fmtGreek(row.net_vega)}
                      </td>
                      <td style={{ padding: '9px 10px', color: C.accent, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {row.pop_range[0]}–{row.pop_range[1]}%
                      </td>
                      <td
                        style={{ padding: '9px 10px', cursor: 'pointer' }}
                        onClick={() => setExpandedRow(isExpanded ? null : row.key)}
                      >
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <ConditionIndicator match={ivMatch} label="IV" />
                          <ConditionIndicator match={dirMatch} label="Dir" />
                          <span style={{ fontSize: '10px', color: C.muted }}>{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${row.key}-exp`} style={{ background: '#0d1220' }}>
                        <td colSpan={12} style={{ padding: '10px 14px', fontSize: '11px', color: C.muted, lineHeight: 1.6, borderBottom: `1px solid ${C.border}22` }}>
                          {row.condition_explanation}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function StrategyDetail({ symbol, onSelectTrade }: Props) {
  const { entitlements } = useEntitlements()
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

  if (loading) return <div style={{ padding: '32px', textAlign: 'center', color: C.muted }}>Analyzing {symbol}...</div>
  if (error) return <div style={{ padding: '16px', color: C.red, background: '#2d0f0f', borderRadius: '8px', margin: '16px' }}>{error}</div>
  if (!data) return null

  const { iv_analysis: iv, bias_analysis: bias, detected_bias, recommendations_by_category, comparison_matrix, news_sentiment } = data
  const showNewsSentiment = entitlements?.features?.news_sentiment ?? false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px',
        padding: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start',
      }}>
        <div>
          <div style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Symbol</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: C.text }}>{data.symbol}</div>
          <div style={{ fontSize: '18px', color: C.accent, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${fmt(bias.price)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <IVRGauge rank={iv.iv_rank} />
          <IVEnvBadge env={iv.iv_environment} />
          <div style={{ fontSize: '11px', color: C.muted }}>{iv.percentile_label}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Detected Bias</div>
            <BiasBadge bias={detected_bias} strength={bias.strength} />
          </div>
          <div style={{ fontSize: '12px', color: C.muted }}>
            RSI(14): <span style={{ color: bias.rsi14 > 60 ? C.green : bias.rsi14 < 40 ? C.red : C.text }}>{fmt(bias.rsi14, 1)}</span>
          </div>
          <div style={{ fontSize: '12px', color: C.muted }}>
            SMA20: <span style={{ color: C.text }}>${fmt(bias.sma20)}</span>{' · '}
            SMA50: <span style={{ color: C.text }}>${fmt(bias.sma50)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
          <div style={{ color: C.muted, textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.08em', marginBottom: '2px' }}>IV Details</div>
          <div style={{ color: C.muted }}>Current IV: <span style={{ color: C.text }}>{((iv.current_iv || 0) * 100).toFixed(1)}%</span></div>
          <div style={{ color: C.muted }}>HV 30d: <span style={{ color: C.text }}>{((iv.hv_30d || 0) * 100).toFixed(1)}%</span></div>
          <div style={{ color: C.muted }}>
            52wk HV range: <span style={{ color: C.text }}>{((iv.hv_52wk_low || 0) * 100).toFixed(1)}% – {((iv.hv_52wk_high || 0) * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Comparison Matrix */}
      <ComparisonMatrix rows={comparison_matrix} symbol={data.symbol} ivEnv={iv.iv_environment} />

      {/* Direction guide */}
      <div style={{
        background: '#0d1220', border: `1px solid ${C.accent}33`, borderRadius: '8px',
        padding: '12px 16px', fontSize: '12px', color: C.muted, lineHeight: 1.6,
      }}>
        <span style={{ color: C.accent, fontWeight: 700 }}>Pick your view: </span>
        The app detects a <strong style={{ color: C.text }}>{detected_bias.replace('_', '-')}</strong> bias,
        but each section below shows the full strategy list for that direction — expand any strategy for the full trade structure.
      </div>

      {/* Category sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {CATEGORY_ORDER.map(cat => {
          const recs = recommendations_by_category[cat] || []
          return (
            <CategorySection
              key={cat}
              category={cat}
              recs={recs}
              symbol={data.symbol}
              onSelectTrade={onSelectTrade}
              newsSentiment={showNewsSentiment ? news_sentiment : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
