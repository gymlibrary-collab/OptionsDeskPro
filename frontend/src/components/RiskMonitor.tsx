import React, { useEffect, useState, useCallback } from 'react'
import { getPositionsRisk, PositionRisk, RiskSignal, getAISettings, aiRiskSummary, getQuote } from '../api/client'
import { useWindowSize } from '../hooks/useWindowSize'

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

function fmtDate(iso: string): string {
  const parts = iso.split('-')
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : iso
}

function fmtChipDate(iso: string): string {
  // "2026-06-25" → "25 Jun"
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [, mm, dd] = iso.split('-')
  return `${parseInt(dd, 10)} ${MONTHS[parseInt(mm, 10) - 1]}`
}

function fmtFullDate(iso: string): string {
  // "2026-06-25" → "25 Jun 2026"
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [yyyy, mm, dd] = iso.split('-')
  return `${parseInt(dd, 10)} ${MONTHS[parseInt(mm, 10) - 1]} ${yyyy}`
}

function daysAgo(isoDate: string): number {
  const entered = new Date(isoDate)
  const today = new Date()
  return Math.floor((today.getTime() - entered.getTime()) / 86400000)
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
        <li>Enter: Symbol <strong>{pos.symbol}</strong> · Expiry <strong>{fmtDate(pos.expiry)}</strong> · Strike <strong>${fmt(pos.strike, 0)}</strong> · Type <strong>{pos.option_type.toUpperCase()}</strong></li>
        <li>Set Action to <strong style={{ color: closeAction === 'SELL' ? C.red : C.green }}>{closeAction}</strong> · Quantity <strong>{qty}</strong></li>
        <li>Confirm the order. This position will disappear once filled.</li>
      </ol>
    </div>
  )
}

// ── Defensive Narrative ────────────────────────────────────────────────────────

function SectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ fontSize: '10px', fontWeight: 700, color, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '6px' }}>
      {label}
    </div>
  )
}

function NarrativeBox({ bg, border, color, title, children }: { bg: string; border: string; color: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: '6px', padding: '10px 12px' }}>
      <SectionHeader label={title} color={color} />
      <div style={{ fontSize: '12px', color: C.text, lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}

function SummaryBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ borderLeft: `3px solid ${C.yellow}`, background: '#1c1800', borderRadius: '0 6px 6px 0', padding: '10px 12px', fontSize: '12px', color: C.text, lineHeight: 1.7 }}>
      {children}
    </div>
  )
}

function PathCard({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '8px 10px', marginBottom: '6px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: C.accent, marginBottom: '4px' }}>{label} — {title}</div>
      <div style={{ fontSize: '12px', color: C.text, lineHeight: 1.65 }}>{children}</div>
    </div>
  )
}

function DefensiveNarrativeSingle({ pos, stockPrice }: { pos: PositionRisk; stockPrice?: number }) {
  if (pos.pnl >= 0) return null

  const entryAction = (pos.entry_action || (pos.quantity > 0 ? 'buy' : 'sell')).toLowerCase()
  const isShort = entryAction === 'sell'
  const qty = Math.abs(pos.quantity)
  const isPut = pos.option_type.toLowerCase() === 'put'

  if (isShort) {
    const collected = pos.avg_cost * qty * 100
    const costToClose = pos.current_price * qty * 100
    const netLoss = costToClose - collected
    const breakeven = isPut ? pos.strike - pos.avg_cost : pos.strike + pos.avg_cost
    const stockAboveBreakeven = stockPrice != null ? (isPut ? stockPrice > breakeven : stockPrice < breakeven) : null
    const assignCapital = pos.strike * qty * 100

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
        <NarrativeBox bg='#1a0a0a' border='#ef444433' color={C.red} title='Financial Reality'>
          <p style={{ margin: '0 0 6px' }}>
            You sold {qty} {pos.option_type} contract{qty !== 1 ? 's' : ''} at ${fmt(pos.avg_cost)} premium × 100 multiplier = <strong>${fmt(collected, 0)}</strong> collected upfront.
          </p>
          <p style={{ margin: '0 0 6px' }}>
            The option is now worth ${fmt(pos.current_price)} per contract — buying it back today costs <strong>${fmt(costToClose, 0)}</strong>.
          </p>
          <p style={{ margin: '0 0 6px' }}>
            Net result if you close right now: ${fmt(collected, 0)} collected − ${fmt(costToClose, 0)} to close = <strong style={{ color: C.red }}>−${fmt(netLoss, 0)} loss</strong>.
          </p>
          <p style={{ margin: '0 0 6px' }}>
            Breakeven at expiry: ${fmt(pos.strike, 0)} strike {isPut ? '−' : '+'} ${fmt(pos.avg_cost)} premium = <strong>${fmt(breakeven)}</strong>.
            The stock must stay <strong>{isPut ? 'above' : 'below'} ${fmt(breakeven)}</strong> for the option to expire worthless.
          </p>
          {stockPrice != null && (
            <p style={{ margin: '0', color: stockAboveBreakeven ? C.green : C.yellow }}>
              {pos.symbol} is currently at ${fmt(stockPrice)} — {stockAboveBreakeven
                ? `above your ${isPut ? '' : 'ceiling '}breakeven of $${fmt(breakeven)}. The position is not yet in maximum-loss territory.`
                : `${isPut ? 'below' : 'above'} your breakeven of $${fmt(breakeven)}. If it stays here until expiry, the full loss is realised.`}
            </p>
          )}
        </NarrativeBox>

        <div>
          <SectionHeader label='Three Paths Forward' color={C.muted} />
          {isPut ? (
            <>
              <PathCard label='A' title='Hold — accept assignment'>
                If {pos.symbol} stays below ${fmt(pos.strike, 0)} at expiry, you buy {qty * 100} shares at ${fmt(pos.strike, 0)} — capital required: <strong>${fmt(assignCapital, 0)}</strong>. Your effective cost basis is ${fmt(breakeven)} (strike minus premium kept), not the strike. Only choose this if you are comfortable owning {pos.symbol} at that price.
              </PathCard>
              <PathCard label='B' title='Roll out in time'>
                Close the put now (costs ${fmt(costToClose, 0)}) and sell a new put at the same or lower strike on a later expiry. If the new premium exceeds ${fmt(costToClose, 0)}, you roll for a net credit — lowering your breakeven without adding capital. Repeat as long as you can roll for a credit.
              </PathCard>
              <PathCard label='C' title='Buy to close — lock in the loss'>
                Pay ${fmt(costToClose, 0)} to exit. Realised net loss = ${fmt(netLoss, 0)}. Choose this if you have lost conviction that {pos.symbol} recovers above ${fmt(breakeven)} before expiry.
              </PathCard>
            </>
          ) : (
            <>
              <PathCard label='A' title='Hold — risk assignment'>
                If {pos.symbol} stays above ${fmt(pos.strike, 0)}, shares get called away at ${fmt(pos.strike, 0)}. Your effective exit price is ${fmt(breakeven)} (strike + premium collected).
              </PathCard>
              <PathCard label='B' title='Roll up and out'>
                Close the call now (costs ${fmt(costToClose, 0)}) and sell a new call at a higher strike on a later expiry for a net credit — raising your ceiling and buying more time.
              </PathCard>
              <PathCard label='C' title='Buy to close — lock in the loss'>
                Pay ${fmt(costToClose, 0)} to exit. Realised net loss = ${fmt(netLoss, 0)}. Choose this if you no longer believe {pos.symbol} will stay below ${fmt(breakeven)}.
              </PathCard>
            </>
          )}
        </div>

        <SummaryBox>
          <strong>To recover:</strong> {pos.symbol} must stay {isPut ? 'above' : 'below'} ${fmt(breakeven)} through expiry ({pos.dte} day{pos.dte !== 1 ? 's' : ''} remaining).
          Rolling is the primary lever while time remains — each roll for credit lowers the breakeven.
          A clean close caps the loss at <strong>${fmt(netLoss, 0)}</strong> and frees capital immediately.
        </SummaryBox>
      </div>
    )
  }

  // Long losing
  const amountPaid = pos.avg_cost * qty * 100
  const currentValue = pos.current_price * qty * 100
  const netLoss = amountPaid - currentValue
  const lostPct = amountPaid > 0 ? (netLoss / amountPaid) * 100 : 0
  const stopLevel = amountPaid * 0.5
  const atOrPastStop = lostPct >= 50

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
      <NarrativeBox bg='#1a0a0a' border='#ef444433' color={C.red} title='Financial Reality'>
        <p style={{ margin: '0 0 6px' }}>
          You bought {qty} {pos.option_type} contract{qty !== 1 ? 's' : ''} at ${fmt(pos.avg_cost)} × 100 multiplier = <strong>${fmt(amountPaid, 0)}</strong> paid upfront.
        </p>
        <p style={{ margin: '0 0 6px' }}>
          They are now worth ${fmt(pos.current_price)} each — total current value <strong>${fmt(currentValue, 0)}</strong>.
        </p>
        <p style={{ margin: '0 0 6px' }}>
          You are down <strong style={{ color: C.red }}>−${fmt(netLoss, 0)}</strong> ({fmt(lostPct, 0)}% of what you paid).
        </p>
        <p style={{ margin: '0' }}>
          Standard 50% stop rule: your exit trigger is <strong>${fmt(stopLevel, 0)}</strong> in losses.
          You are <strong style={{ color: atOrPastStop ? C.red : C.yellow }}>{atOrPastStop ? 'at or past' : 'approaching'}</strong> that level.
          {pos.dte} day{pos.dte !== 1 ? 's' : ''} remain before expiry.
        </p>
      </NarrativeBox>

      <div>
        <SectionHeader label='Two Paths Forward' color={C.muted} />
        <PathCard label='A' title='Hold — wait for recovery'>
          {pos.dte} day{pos.dte !== 1 ? 's' : ''} remain. Valid only while the original thesis and catalyst are still intact.
          Risk: the position continues decaying toward zero and theta bleed accelerates near expiry.
        </PathCard>
        <PathCard label='B' title='Sell to close — lock in the loss'>
          You recover ${fmt(currentValue, 0)} of the ${fmt(amountPaid, 0)} paid, locking in −${fmt(netLoss, 0)}.
          Options that lose 50% of cost rarely recover fast enough to justify continued theta bleed. Closing frees capital for the next trade.
        </PathCard>
      </div>

      <SummaryBox>
        Long options lose value every day — the pace accelerates near expiry.
        {pos.dte < 14
          ? ` With only ${pos.dte} days remaining, time is very short.`
          : ` With ${pos.dte} days remaining, time is becoming limited.`}
        {atOrPastStop
          ? ` You are past the 50% stop level ($${fmt(stopLevel, 0)}). The disciplined move is to exit and preserve capital.`
          : ` You are approaching the 50% stop level ($${fmt(stopLevel, 0)}). Take the small loss before it becomes a large one.`}
      </SummaryBox>
    </div>
  )
}

function DefensiveNarrativeGroup({ positions, stockPrices }: { positions: PositionRisk[]; stockPrices: Record<string, number> }) {
  const combinedPnl = positions.reduce((s, p) => s + p.pnl, 0)
  // SELL legs collect premium (positive); BUY legs pay premium (negative)
  const netPremium = positions.reduce((s, p) => {
    const action = (p.entry_action || (p.quantity > 0 ? 'buy' : 'sell')).toLowerCase()
    const sign = action === 'sell' ? 1 : -1
    return s + sign * p.avg_cost * Math.abs(p.quantity) * 100
  }, 0)
  const isCredit = netPremium > 0
  const maxDte = Math.max(...positions.map(p => p.dte))
  const symbol = positions[0]?.symbol ?? ''
  const stockPrice = stockPrices[symbol]
  const losingLegs = positions.filter(p => p.pnl < 0)

  // Strategy is net profitable — show context, not alarm
  if (combinedPnl >= 0) {
    const netProfit = combinedPnl
    const losingLeg = losingLegs[0]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
        <NarrativeBox bg='#0a2d14' border='#22c55e33' color={C.green} title='Strategy Context'>
          <p style={{ margin: '0 0 6px' }}>
            This strategy is <strong style={{ color: C.green }}>net profitable</strong> at <strong style={{ color: C.green }}>+${fmt(netProfit, 0)}</strong> across all {positions.length} legs — the strategy is working as designed.
          </p>
          {losingLeg && (
            <p style={{ margin: '0 0 6px' }}>
              The <strong>{losingLeg.option_type.toUpperCase()} ${fmt(losingLeg.strike, 0)}</strong> leg is down −${fmt(Math.abs(losingLeg.pnl), 0)}, but that is offset by the gains on the other leg{positions.length > 2 ? 's' : ''}.
              {isCredit ? ' For a credit spread, the long leg losing value is expected when the trade is moving in your favour.' : ' This is normal for a multi-leg debit strategy where legs move in opposite directions.'}
            </p>
          )}
          <p style={{ margin: '0' }}>
            Evaluate this strategy by its <strong>net P&L (+${fmt(netProfit, 0)})</strong>, not by individual legs.
            Monitor for the combined P&L approaching zero or turning negative.
          </p>
        </NarrativeBox>
        <SummaryBox>
          The strategy net is <strong style={{ color: C.green }}>+${fmt(netProfit, 0)}</strong> with {maxDte} day{maxDte !== 1 ? 's' : ''} remaining.
          {isCredit
            ? ` As a credit strategy, your profit target is to keep most of the net credit collected ($${fmt(Math.abs(netPremium), 0)}). Consider closing early if you have reached 50% of max profit.`
            : ` Watch for the net P&L to drop below zero — that is when active management becomes necessary.`}
        </SummaryBox>
      </div>
    )
  }

  // Net losing — full defensive narrative below
  const netLoss = Math.abs(combinedPnl)

  if (isCredit) {
    const netCredit = netPremium
    const costToCloseAll = netCredit + netLoss
    const challenged = [...positions].sort((a, b) => a.pnl - b.pnl)[0]
    const cIsPut = challenged.option_type.toLowerCase() === 'put'
    const cEntryAction = (challenged.entry_action || (challenged.quantity > 0 ? 'buy' : 'sell')).toLowerCase()
    const cIsShort = cEntryAction === 'sell'
    const cBreakeven = cIsShort
      ? (cIsPut ? challenged.strike - challenged.avg_cost : challenged.strike + challenged.avg_cost)
      : null
    const stockVsBreakeven = stockPrice != null && cBreakeven != null
      ? (cIsPut ? stockPrice > cBreakeven : stockPrice < cBreakeven)
      : null

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
        <NarrativeBox bg='#1a0a0a' border='#ef444433' color={C.red} title='Financial Reality — Strategy'>
          <p style={{ margin: '0 0 6px' }}>
            This is a credit strategy — you collected <strong>${fmt(netCredit, 0)}</strong> in net premium across {positions.length} leg{positions.length !== 1 ? 's' : ''} when you opened the trade.
          </p>
          <p style={{ margin: '0 0 6px' }}>
            The strategy is currently showing a net loss of <strong style={{ color: C.red }}>−${fmt(netLoss, 0)}</strong>, meaning the combined mark-to-market of all legs has moved against you.
          </p>
          <p style={{ margin: '0 0 6px' }}>
            Most challenged leg: <strong>${fmt(challenged.strike, 0)} {challenged.option_type.toUpperCase()}</strong> (P&L: −${fmt(Math.abs(challenged.pnl), 0)}).
            {cBreakeven != null && <> Its individual breakeven is <strong>${fmt(cBreakeven)}</strong>.</>}
          </p>
          {stockPrice != null && cBreakeven != null && (
            <p style={{ margin: '0', color: stockVsBreakeven ? C.green : C.yellow }}>
              {symbol} is at ${fmt(stockPrice)} — {stockVsBreakeven
                ? `on the right side of the ${challenged.option_type} breakeven at $${fmt(cBreakeven)}.`
                : `past the ${challenged.option_type} breakeven at $${fmt(cBreakeven)}, adding pressure to that leg.`}
            </p>
          )}
        </NarrativeBox>

        <div>
          <SectionHeader label='Three Paths Forward' color={C.muted} />
          <PathCard label='A' title='Hold'>
            With {maxDte} day{maxDte !== 1 ? 's' : ''} remaining, the strategy can recover if the underlying moves back into the profitable zone. Only valid if the original thesis is still intact.
          </PathCard>
          <PathCard label='B' title={`Roll the challenged leg ($${fmt(challenged.strike, 0)} ${challenged.option_type.toUpperCase()})`}>
            Close only that leg and reopen at a more favourable strike or later expiry for a net credit.
            This preserves the healthy legs and lowers overall breakeven without closing the whole trade.
            Only worthwhile if you can roll for a net credit.
          </PathCard>
          <PathCard label='C' title={`Close all ${positions.length} legs`}>
            You collected ${fmt(netCredit, 0)} to open. Closing all legs today costs approximately ${fmt(costToCloseAll, 0)}, realising a net loss of <strong>${fmt(netLoss, 0)}</strong>.
            Choose this if the setup has broken down and the thesis no longer holds.
          </PathCard>
        </div>

        <SummaryBox>
          You collected <strong>${fmt(netCredit, 0)}</strong> in net credit when this strategy was opened.
          Rolling the challenged leg (${fmt(challenged.strike, 0)} {challenged.option_type.toUpperCase()}) for a credit is the primary adjustment — it lowers breakeven without closing the whole trade.
          A full close at <strong>−${fmt(netLoss, 0)}</strong> is the clean exit if the setup has broken down.
        </SummaryBox>
      </div>
    )
  }

  // Debit strategy
  const amountPaid = Math.abs(netPremium)
  const lostPct = amountPaid > 0 ? (netLoss / amountPaid) * 100 : 0
  const stopLevel = amountPaid * 0.5
  const atOrPastStop = lostPct >= 50

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
      <NarrativeBox bg='#1a0a0a' border='#ef444433' color={C.red} title='Financial Reality — Strategy'>
        <p style={{ margin: '0 0 6px' }}>
          This is a debit strategy — you paid <strong>${fmt(amountPaid, 0)}</strong> net premium across {positions.length} leg{positions.length !== 1 ? 's' : ''} to open the trade.
        </p>
        <p style={{ margin: '0 0 6px' }}>
          Currently showing a net loss of <strong style={{ color: C.red }}>−${fmt(netLoss, 0)}</strong> ({fmt(lostPct, 0)}% of what you paid).
          Maximum possible loss is the full debit paid: <strong>${fmt(amountPaid, 0)}</strong>.
        </p>
        <p style={{ margin: '0' }}>
          50% stop triggers at <strong>${fmt(stopLevel, 0)}</strong>.
          You are <strong style={{ color: atOrPastStop ? C.red : C.yellow }}>{atOrPastStop ? 'at or past' : 'approaching'}</strong> that level with {maxDte} day{maxDte !== 1 ? 's' : ''} to expiry.
        </p>
      </NarrativeBox>

      <div>
        <SectionHeader label='Two Paths Forward' color={C.muted} />
        <PathCard label='A' title='Hold'>
          With {maxDte} day{maxDte !== 1 ? 's' : ''} remaining. Only valid if the original thesis and catalyst are still intact. Risk: the spread continues losing value toward zero.
        </PathCard>
        <PathCard label='B' title={`Close all ${positions.length} legs — stop rule`}>
          {atOrPastStop
            ? `You have hit the 50% stop level. Closing all legs locks in −$${fmt(netLoss, 0)} and stops the bleed. The disciplined move is to exit.`
            : `Closing all legs now locks in −$${fmt(netLoss, 0)} — before reaching the full $${fmt(stopLevel, 0)} stop. Take the partial loss and preserve capital.`}
        </PathCard>
      </div>

      <SummaryBox>
        Debit paid: <strong>${fmt(amountPaid, 0)}</strong>. Current loss: <strong>{fmt(lostPct, 0)}%</strong> of the debit paid.
        {atOrPastStop
          ? ` You are past the 50% stop level ($${fmt(stopLevel, 0)}). The disciplined move is to close all legs and preserve capital.`
          : ` You are approaching the 50% stop level ($${fmt(stopLevel, 0)}). Take the small loss before it becomes a large one.`}
      </SummaryBox>
    </div>
  )
}

// ── PositionCard (LegCard in right panel) ────────────────────────────────────

function PositionCard({ pos, stockPrice, isInGroup }: {
  pos: PositionRisk
  stockPrice?: number
  isInGroup?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [actionPlanOpen, setActionPlanOpen] = useState(false)
  const isLosing = pos.pnl < 0

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
  const tileLabel = isSell ? 'Collected' : 'Cost'

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}44`, borderLeft: `3px solid ${borderColor}`, borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: C.text }}>{pos.symbol}</span>
            {stockPrice != null && (
              <span style={{ fontSize: '13px', color: '#7dd3fc', fontWeight: 600 }}>${fmt(stockPrice)}</span>
            )}
            <ActionBadge action={entryAction} />
            <TypeBadge type={pos.option_type} />
            <span style={{ fontSize: '12px', color: '#7dd3fc' }}>${fmt(pos.strike, 0)} · {fmtDate(pos.expiry)}</span>
            {pos.strategy_name && <span style={{ fontSize: '10px', background: '#1a1440', border: '1px solid #7c6af744', color: C.accent, padding: '1px 7px', borderRadius: '8px', fontWeight: 600 }}>{pos.strategy_name}</span>}
            {pos.entered_at && (
              <span style={{ fontSize: '10px', background: '#1a1d27', border: '1px solid #2d3148', color: '#64748b', padding: '1px 6px', borderRadius: '6px' }}>
                Entered {fmtFullDate(pos.entered_at)}
              </span>
            )}
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
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <div style={{ background: C.surface2, borderRadius: '8px', padding: '8px 14px' }}>
          <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '3px' }}>Days Left</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: pos.dte <= 7 ? C.red : pos.dte <= 21 ? C.yellow : C.text }}>{pos.dte}<span style={{ fontSize: '12px', fontWeight: 400, marginLeft: '1px' }}>d</span></div>
        </div>
        <div style={{ background: C.surface2, borderRadius: '8px', padding: '8px 14px' }}>
          <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '3px' }}>Qty</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: C.text }}>{pos.quantity > 0 ? '+' : ''}{pos.quantity}</div>
        </div>
        <div style={{ background: C.surface2, borderRadius: '8px', padding: '8px 14px' }}>
          <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '3px' }}>Entry</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: C.text }}>${fmt(pos.avg_cost)}</div>
        </div>
        <div style={{ background: C.surface2, borderRadius: '8px', padding: '8px 14px' }}>
          <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '3px' }}>Current</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: priceUp ? C.green : C.red }}>${fmt(pos.current_price)}</div>
        </div>
        <div style={{ background: C.surface2, borderRadius: '8px', padding: '8px 14px' }}>
          <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '3px' }}>{tileLabel}</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: C.muted }}>${fmt(totalCost, 0)}</div>
        </div>
        <div style={{ background: C.surface2, borderRadius: '8px', padding: '8px 14px' }}>
          <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '3px' }}>Value</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: priceUp ? C.green : C.red }}>${fmt(currentValue, 0)}</div>
        </div>
        <div style={{ background: C.surface2, borderRadius: '8px', padding: '8px 14px', border: `1px solid ${pos.pnl >= 0 ? C.green : C.red}33` }}>
          <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '3px' }}>P&amp;L</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: pos.pnl >= 0 ? C.green : C.red }}>{pos.pnl >= 0 ? '+' : ''}${fmt(pos.pnl)}</div>
        </div>
        {pos.iv_rank !== undefined && pos.iv_rank !== null && (
          <div style={{ background: C.surface2, borderRadius: '8px', padding: '8px 14px' }}>
            <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '3px' }}>IV Rank</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: pos.iv_rank > 50 ? C.yellow : C.text }}>{fmt(pos.iv_rank, 0)}</div>
          </div>
        )}
        {pos.bias && (
          <div style={{ background: C.surface2, borderRadius: '8px', padding: '8px 14px' }}>
            <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '3px' }}>Bias</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: pos.bias === 'BULLISH' ? C.green : pos.bias === 'BEARISH' ? C.red : C.muted }}>{pos.bias}</div>
          </div>
        )}
      </div>
      <ProgressBar pct={pos.pnl_pct} target={pos.profit_target_pct} level={pos.risk_level} />
      {urgentSignals.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{urgentSignals.map((s, i) => <SignalRow key={i} signal={s} />)}</div>}

      {/* Action Plan — plain text trigger, no pill border */}
      {!isInGroup && isLosing && (
        <button
          onClick={() => setActionPlanOpen(o => !o)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: C.yellow, fontSize: '12px', fontWeight: 700 }}
        >
          <span>⚠</span>
          {actionPlanOpen ? 'Hide Action Plan' : 'Action Plan'}
        </button>
      )}

      {/* Action Plan panel — includes close instructions */}
      {!isInGroup && actionPlanOpen && (
        <div style={{ borderTop: `1px solid ${C.yellow}33`, paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <DefensiveNarrativeSingle pos={pos} stockPrice={stockPrice} />
          <CloseInstructions pos={pos} />
        </div>
      )}

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {greenSignals.map((s, i) => <SignalRow key={i} signal={s} />)}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '11px', color: C.muted, marginTop: '4px', background: C.surface2, borderRadius: '6px', padding: '8px 10px' }}>
            <span>Quantity: {pos.quantity > 0 ? '+' : ''}{pos.quantity}</span>
            <span>Entry price: ${fmt(pos.avg_cost)}</span>
            <span>Current price: ${fmt(pos.current_price)}</span>
            {pos.iv_environment && <span>IV environment: {pos.iv_environment}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── NarrativePanel ────────────────────────────────────────────────────────────

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

// ── StrategyGroup type ────────────────────────────────────────────────────────

interface StrategyGroup {
  key: string
  label: string
  positions: PositionRisk[]
  narrative: Record<string, unknown> | undefined
  enteredAt: string          // "YYYY-MM-DD" — min entered_at across all legs of the group
  worstLevel: 'green' | 'yellow' | 'red'
  combinedPnl: number
  worstLegPnlPct: number    // Math.min(...positions.map(p => p.pnl_pct))
}

// ── buildGroups — extracted so it can be called from both render and load ────

function buildGroups(data: PositionRisk[]): StrategyGroup[] {
  const riskRank: Record<string, number> = { red: 0, yellow: 1, green: 2 }
  const groupMap = new Map<string, {
    key: string
    label: string
    positions: PositionRisk[]
    narrative: Record<string, unknown> | undefined
  }>()

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
    if (!g.narrative && pos.narrative) g.narrative = pos.narrative
  }

  const groups: StrategyGroup[] = [...groupMap.values()].map(g => {
    const worstLevel = g.positions.reduce<'green' | 'yellow' | 'red'>((worst, p) => {
      return riskRank[p.risk_level] < riskRank[worst] ? p.risk_level as 'green' | 'yellow' | 'red' : worst
    }, 'green')
    const combinedPnl = g.positions.reduce((s, p) => s + p.pnl, 0)
    const worstLegPnlPct = Math.min(...g.positions.map(p => p.pnl_pct))
    // Take the minimum entered_at across all legs (string comparison is valid for YYYY-MM-DD)
    const enteredAt = g.positions.reduce((min, p) => {
      const d = p.entered_at || ''
      return d && (!min || d < min) ? d : min
    }, '')
    return { ...g, worstLevel, combinedPnl, worstLegPnlPct, enteredAt }
  })

  // Sort: newest entered_at first (descending); tiebreak by worst risk level
  return groups.sort((a, b) => {
    if (b.enteredAt > a.enteredAt) return 1
    if (b.enteredAt < a.enteredAt) return -1
    const aWorst = a.positions.reduce<number>((w, p) => Math.min(w, riskRank[p.risk_level]), 2)
    const bWorst = b.positions.reduce<number>((w, p) => Math.min(w, riskRank[p.risk_level]), 2)
    return aWorst - bWorst
  })
}

// ── MiniProgressBar ───────────────────────────────────────────────────────────

function MiniProgressBar({ worstLegPnlPct, level }: { worstLegPnlPct: number; level: 'green' | 'yellow' | 'red' }) {
  const displayPct = Math.min(Math.abs(worstLegPnlPct), 100)
  const color = worstLegPnlPct >= 0 ? C.green : riskColor(level)
  return (
    <div style={{ height: '3px', background: '#252836', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
      <div style={{ height: '100%', width: `${displayPct}%`, background: color, borderRadius: '2px' }} />
    </div>
  )
}

// ── DateSeparatorRow ──────────────────────────────────────────────────────────

function DateSeparatorRow({ dateStr }: { dateStr: string }) {
  return (
    <div style={{
      padding: '6px 12px 4px',
      fontSize: '10px',
      fontWeight: 700,
      color: C.muted,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.08em',
      background: C.bg,
      borderBottom: `1px solid ${C.border}`,
    }}>
      {fmtFullDate(dateStr)}
    </div>
  )
}

// ── RiskListRow ───────────────────────────────────────────────────────────────

function RiskListRow({ group, isSelected, onClick }: {
  group: StrategyGroup
  isSelected: boolean
  onClick: () => void
}) {
  const worstDte = Math.max(...group.positions.map(p => p.dte))
  const borderColor = riskColor(group.worstLevel)

  return (
    <div
      onClick={onClick}
      style={{
        borderLeft: `3px solid ${borderColor}`,
        background: isSelected ? '#1e2135' : C.surface,
        padding: '10px 12px',
        cursor: 'pointer',
        borderBottom: `1px solid ${C.border}`,
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
        <span style={{
          fontSize: '12px',
          fontWeight: 700,
          color: C.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const,
          flex: 1,
          minWidth: 0,
        }}>
          {group.key === '_ungrouped'
            ? group.positions.map(p => p.symbol).join(', ')
            : group.label}
        </span>
        <span style={{
          fontSize: '10px',
          fontWeight: 700,
          color: borderColor,
          background: riskBg(group.worstLevel),
          border: `1px solid ${borderColor}44`,
          padding: '1px 6px',
          borderRadius: '6px',
          whiteSpace: 'nowrap' as const,
          flexShrink: 0,
        }}>
          {riskLabel(group.worstLevel)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
        {group.enteredAt && (
          <span style={{
            fontSize: '10px',
            background: '#1a1d27',
            border: `1px solid ${C.border}`,
            color: C.muted,
            padding: '1px 6px',
            borderRadius: '6px',
          }}>
            Entered {fmtChipDate(group.enteredAt)}
          </span>
        )}
        <span style={{ fontSize: '11px', color: C.muted }}>
          {worstDte}d
        </span>
        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          color: group.combinedPnl >= 0 ? C.green : C.red,
          marginLeft: 'auto',
        }}>
          {group.combinedPnl >= 0 ? '+' : ''}${fmt(group.combinedPnl)}
        </span>
      </div>
      <MiniProgressBar worstLegPnlPct={group.worstLegPnlPct} level={group.worstLevel} />
    </div>
  )
}

// ── TradeNarrativeSection ─────────────────────────────────────────────────────

function TradeNarrativeSection({ narrative }: { narrative: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom: '12px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: open ? '#1a1440' : 'transparent',
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
        }}
      >
        {open ? '▲' : '▼'} Trade Narrative
      </button>
      {open && (
        <div style={{ marginTop: '8px' }}>
          <NarrativePanel narrative={narrative} />
        </div>
      )}
    </div>
  )
}

// ── ActionPlanBox ─────────────────────────────────────────────────────────────

function ActionPlanBox({ group, stockPrices }: { group: StrategyGroup; stockPrices: Record<string, number> }) {
  const combinedPnl = group.combinedPnl

  if (group.positions.length === 1) {
    const pos = group.positions[0]
    if (combinedPnl < 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <DefensiveNarrativeSingle pos={pos} stockPrice={stockPrices[pos.symbol]} />
          <CloseInstructions pos={pos} />
        </div>
      )
    }
    // combinedPnl >= 0 for single leg — DefensiveNarrativeSingle returns null; nothing to show
    return null
  }

  // Multi-leg group
  return <DefensiveNarrativeGroup positions={group.positions} stockPrices={stockPrices} />
}

// ── RightPanelHeader ──────────────────────────────────────────────────────────

function RightPanelHeader({ group }: { group: StrategyGroup }) {
  const nearestExpiry = [...group.positions].sort((a, b) => a.expiry.localeCompare(b.expiry))[0]?.expiry
  const firstIvRank = group.positions.find(p => p.iv_rank != null)?.iv_rank
  const legCount = group.positions.length
  const days = group.enteredAt ? daysAgo(group.enteredAt) : null

  const name = group.key === '_ungrouped'
    ? group.positions.map(p => p.symbol).join(' / ')
    : group.label

  return (
    <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const, marginBottom: '6px' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: C.text }}>{name}</span>
        <span style={{
          fontSize: '10px',
          fontWeight: 700,
          color: riskColor(group.worstLevel),
          background: riskBg(group.worstLevel),
          border: `1px solid ${riskColor(group.worstLevel)}44`,
          padding: '2px 8px',
          borderRadius: '6px',
          textTransform: 'uppercase' as const,
        }}>
          {riskLabel(group.worstLevel)}
        </span>
        <span style={{ fontSize: '15px', fontWeight: 700, color: group.combinedPnl >= 0 ? C.green : C.red }}>
          {group.combinedPnl >= 0 ? '+' : ''}${fmt(group.combinedPnl)}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: C.muted, marginBottom: '6px' }}>
        {legCount} leg{legCount !== 1 ? 's' : ''}
        {nearestExpiry && <> · Expiry {fmtDate(nearestExpiry)}</>}
        {firstIvRank != null && <> · IV Rank {fmt(firstIvRank, 0)}</>}
      </div>
      {group.enteredAt && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          color: C.muted,
          background: '#1a1d27',
          border: `1px solid ${C.border}`,
          borderRadius: '6px',
          padding: '3px 8px',
        }}>
          <span>📅</span>
          <span>Trade entered {fmtFullDate(group.enteredAt)}{days !== null ? ` — ${days} day${days !== 1 ? 's' : ''} ago` : ''}</span>
        </div>
      )}
    </div>
  )
}

// ── RightPanelDetail ──────────────────────────────────────────────────────────

function RightPanelDetail({ group, stockPrices }: {
  group: StrategyGroup
  stockPrices: Record<string, number>
}) {
  const riskRank: Record<string, number> = { red: 0, yellow: 1, green: 2 }
  const sortedPositions = [...group.positions].sort(
    (a, b) => riskRank[a.risk_level] - riskRank[b.risk_level]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <RightPanelHeader group={group} />
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {group.narrative && <TradeNarrativeSection narrative={group.narrative} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sortedPositions.map((pos, i) => (
            <PositionCard
              key={`${pos.symbol}-${pos.strike}-${pos.expiry}-${pos.option_type}-${i}`}
              pos={pos}
              stockPrice={stockPrices[pos.symbol]}
              isInGroup={true}
            />
          ))}
        </div>
        <ActionPlanBox group={group} stockPrices={stockPrices} />
      </div>
    </div>
  )
}

// ── Main RiskMonitor ──────────────────────────────────────────────────────────

export default function RiskMonitor() {
  const { isMobile } = useWindowSize()

  const [data, setData] = useState<PositionRisk[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState('')
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [stockPrices, setStockPrices] = useState<Record<string, number>>({})
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [mobileExpandedKey, setMobileExpandedKey] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const result = await getPositionsRisk()
      setData(result)
      setLastUpdated(new Date())
      // Auto-select: on initial load always select first group; on silent refresh
      // preserve selection if the group still exists, otherwise fall back to first.
      setSelectedGroupKey(prev => {
        const built = buildGroups(result)
        if (built.length === 0) return null
        if (silent && prev && built.some(g => g.key === prev)) return prev
        return built[0].key
      })
      const symbols = [...new Set(result.map(p => p.symbol))]
      Promise.all(symbols.map(s => getQuote(s).then(q => ({ s, price: q.price })).catch(() => null)))
        .then(results => {
          const map: Record<string, number> = {}
          results.forEach(r => { if (r) map[r.s] = r.price })
          setStockPrices(map)
        })
    } catch (e: unknown) {
      if (!silent) {
        const err = e as { response?: { data?: { detail?: string } }; message?: string }
        setError(err?.response?.data?.detail || err?.message || 'Failed to load risk data')
      }
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
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      setAiError(err?.response?.data?.detail || 'AI summary failed — please try again.')
    } finally {
      setAiLoading(false)
    }
  }

  const redCount = data.filter(p => p.risk_level === 'red').length
  const yellowCount = data.filter(p => p.risk_level === 'yellow').length
  const greenCount = data.filter(p => p.risk_level === 'green').length
  const totalPnl = data.reduce((sum, p) => sum + p.pnl, 0)

  const groups = buildGroups(data)
  const selectedGroup = groups.find(g => g.key === selectedGroupKey) ?? null

  // ── Desktop split layout ──────────────────────────────────────────────────

  const renderDesktopSplit = () => {
    let lastRenderedDate = ''
    return (
      <div style={{
        display: 'flex',
        maxHeight: 'calc(100vh - 260px)',
        overflow: 'hidden',
        borderTop: `1px solid ${C.border}`,
      }}>
        {/* Left panel */}
        <div style={{
          width: '270px',
          flexShrink: 0,
          overflowY: 'auto' as const,
          borderRight: `1px solid ${C.border}`,
          background: C.bg,
        }}>
          {groups.map(group => {
            const showSeparator = group.enteredAt !== lastRenderedDate
            if (showSeparator) lastRenderedDate = group.enteredAt
            return (
              <React.Fragment key={group.key}>
                {showSeparator && group.enteredAt && (
                  <DateSeparatorRow dateStr={group.enteredAt} />
                )}
                <RiskListRow
                  group={group}
                  isSelected={group.key === selectedGroupKey}
                  onClick={() => setSelectedGroupKey(group.key)}
                />
              </React.Fragment>
            )
          })}
        </div>

        {/* Right panel */}
        <div style={{
          flex: 1,
          overflowY: 'auto' as const,
          background: C.surface,
          minWidth: 0,
        }}>
          {selectedGroup ? (
            <RightPanelDetail
              group={selectedGroup}
              stockPrices={stockPrices}
            />
          ) : (
            <div style={{ color: C.muted, fontSize: '13px', padding: '40px', textAlign: 'center' }}>
              Select a position from the list
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Mobile accordion layout ───────────────────────────────────────────────

  const renderMobileAccordion = () => {
    let lastRenderedDate = ''
    return (
      <div style={{ borderTop: `1px solid ${C.border}` }}>
        {groups.map(group => {
          const showSeparator = group.enteredAt !== lastRenderedDate
          if (showSeparator) lastRenderedDate = group.enteredAt
          const isExpanded = mobileExpandedKey === group.key
          return (
            <React.Fragment key={group.key}>
              {showSeparator && group.enteredAt && (
                <DateSeparatorRow dateStr={group.enteredAt} />
              )}
              <RiskListRow
                group={group}
                isSelected={isExpanded}
                onClick={() => setMobileExpandedKey(isExpanded ? null : group.key)}
              />
              {isExpanded && (
                <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                  <RightPanelDetail
                    group={group}
                    stockPrices={stockPrices}
                  />
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ marginTop: '16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
      {/* Header strip */}
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

      {/* Summary stat chips */}
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

      {/* Loading / error / empty states */}
      {loading && (
        <div style={{ color: C.muted, fontSize: '13px', padding: '20px 16px', textAlign: 'center' }}>
          Analysing your positions…
        </div>
      )}
      {!loading && error && (
        <div style={{ color: C.red, fontSize: '12px', padding: '10px 16px' }}>{error}</div>
      )}
      {!loading && !error && data.length === 0 && (
        <div style={{ color: C.muted, fontSize: '13px', padding: '20px 16px', textAlign: 'center' }}>
          No open positions to monitor
        </div>
      )}

      {/* Master-Detail split (desktop) or Accordion (mobile) */}
      {!loading && !error && data.length > 0 && (
        isMobile ? renderMobileAccordion() : renderDesktopSplit()
      )}

      {/* AI Risk Overview — below split on all viewports */}
      {!loading && data.length > 0 && aiEnabled && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
  )
}
