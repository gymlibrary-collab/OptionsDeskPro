import React, { useEffect, useState, useCallback } from 'react'
import { getPositionsRisk, PositionRisk, getAISettings, aiRiskSummary, getQuote } from '../api/client'
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

function fmtFullDate(iso: string): string {
  // "2026-06-25" → "25 Jun 2026"
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [yyyy, mm, dd] = iso.split('-')
  return `${parseInt(dd, 10)} ${MONTHS[parseInt(mm, 10) - 1]} ${yyyy}`
}

function fmtChipDate(iso: string): string {
  // "2026-06-24" → "24 Jun"
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const parts = iso.split('-')
  if (parts.length !== 3) return ''
  const day = parseInt(parts[2], 10)
  const mon = MONTHS[parseInt(parts[1], 10) - 1]
  if (!mon || isNaN(day)) return ''
  return `${day} ${mon}`
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

function riskShort(level: string): string {
  if (level === 'red') return 'HIGH'
  if (level === 'yellow') return 'WATCH'
  return 'OK'
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

// ── LegCard ───────────────────────────────────────────────────────────────────

function LegCard({ pos }: { pos: PositionRisk }) {
  const entryAction = (pos.entry_action || (pos.quantity > 0 ? 'buy' : 'sell')).toLowerCase()
  const isSell = entryAction === 'sell'
  const qty = Math.abs(pos.quantity)
  const tileLabel = isSell ? 'Collected' : 'Cost'
  const tileValue = pos.avg_cost * qty * 100

  const ivColor =
    pos.iv_rank == null ? undefined
    : pos.iv_rank > 70  ? C.red
    : pos.iv_rank > 50  ? C.yellow
    : C.text

  const pnlColor = pos.pnl >= 0 ? C.green : C.red
  const pnlDisplay = pos.pnl >= 0
    ? `+$${fmt(pos.pnl)}`
    : `-$${fmt(Math.abs(pos.pnl))}`

  const topBorderColor = riskColor(pos.risk_level)

  return (
    <div style={{
      background: riskBg(pos.risk_level),
      border: `1px solid ${topBorderColor}44`,
      borderTop: `3px solid ${topBorderColor}`,
      borderRadius: '8px',
      padding: '10px 12px',
      maxWidth: '360px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: C.text }}>{pos.symbol}</span>
          <ActionBadge action={entryAction} />
          <TypeBadge type={pos.option_type} />
          <span style={{
            display: 'inline-block',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 700,
            background: C.surface2,
            color: C.muted,
            border: `1px solid ${C.border}`,
          }}>
            ×{qty}
          </span>
        </div>
        <span style={{ fontSize: '11px', fontWeight: 700, color: topBorderColor, flexShrink: 0 }}>
          {riskShort(pos.risk_level)}
        </span>
      </div>

      {/* Sub-line */}
      <div style={{ fontSize: '12px', color: '#7dd3fc' }}>
        ${fmt(pos.strike, 0)} · {pos.dte}d left
      </div>

      {/* 3-tile mini-metric row */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {/* Qty tile — always present */}
        <div style={{ flex: 1, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '6px 10px' }}>
          <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '2px' }}>Qty</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>{qty}</div>
        </div>
        {/* IV Rank tile — omitted when null/undefined */}
        {pos.iv_rank != null && (
          <div style={{ flex: 1, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '6px 10px' }}>
            <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '2px' }}>IV Rank</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: ivColor }}>{fmt(pos.iv_rank, 0)}</div>
          </div>
        )}
        {/* Cost / Collected tile — always present */}
        <div style={{ flex: 1, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '6px 10px' }}>
          <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '2px' }}>{tileLabel}</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>${fmt(tileValue, 0)}</div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '12px',
        borderTop: `1px solid ${C.border}`,
        paddingTop: '8px',
      }}>
        <span>
          <span style={{ color: C.muted }}>ENTRY→NOW </span>
          <span style={{ color: C.text }}>${fmt(pos.avg_cost)}</span>
          <span style={{ color: C.muted }}> → </span>
          <span style={{ color: C.text }}>${fmt(pos.current_price)}</span>
        </span>
        <span style={{ fontWeight: 700, color: pnlColor }}>{pnlDisplay}</span>
      </div>

      {/* Progress bar */}
      <MiniProgressBar worstLegPnlPct={pos.pnl_pct} level={pos.risk_level} />
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
  worstLevel: 'green' | 'yellow' | 'red'   // RETAINED — kept for potential future use
  combinedPnl: number
  worstLegPnlPct: number    // Math.min(...positions.map(p => p.pnl_pct)) — RETAINED
  groupLevel: 'green' | 'yellow' | 'red'   // group-aware badge level
  groupPnlPct: number                        // combined P&L as % of combined cost basis
}

// ── Sort types and pure sort function ─────────────────────────────────────────

type SortMode = 'newest' | 'risk' | 'pnl'

const riskRank: Record<string, number> = { red: 0, yellow: 1, green: 2 }

function sortGroups(groups: StrategyGroup[], mode: SortMode): StrategyGroup[] {
  if (mode === 'newest') {
    return [...groups].sort((a, b) => {
      if (b.enteredAt > a.enteredAt) return 1
      if (b.enteredAt < a.enteredAt) return -1
      return riskRank[a.groupLevel] - riskRank[b.groupLevel]
    })
  }
  if (mode === 'risk') {
    return [...groups].sort((a, b) => {
      const rankDiff = riskRank[a.groupLevel] - riskRank[b.groupLevel]
      if (rankDiff !== 0) return rankDiff
      if (a.combinedPnl !== b.combinedPnl) return a.combinedPnl - b.combinedPnl
      if (a.enteredAt === '' && b.enteredAt === '') return 0
      if (a.enteredAt === '') return 1
      if (b.enteredAt === '') return -1
      return b.enteredAt.localeCompare(a.enteredAt)
    })
  }
  // mode === 'pnl'
  return [...groups].sort((a, b) => {
    if (a.combinedPnl !== b.combinedPnl) return a.combinedPnl - b.combinedPnl
    if (a.enteredAt === '' && b.enteredAt === '') return 0
    if (a.enteredAt === '') return 1
    if (b.enteredAt === '') return -1
    return b.enteredAt.localeCompare(a.enteredAt)
  })
}

// ── buildGroups — extracted so it can be called from both render and load ────

function buildGroups(data: PositionRisk[]): StrategyGroup[] {
  const groupMap = new Map<string, {
    key: string
    label: string
    positions: PositionRisk[]
    narrative: Record<string, unknown> | undefined
  }>()

  let ungroupedIdx = 0
  for (const pos of data) {
    // Named strategy groups share a key; ungrouped positions each get their own row
    const key = pos.strategy_key || `_ungrouped_${ungroupedIdx++}`
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        label: pos.strategy_name || pos.symbol,
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

    // ── New: group-level risk computation ────────────────────────────────────
    const combinedCostBasis = g.positions.reduce(
      (s, p) => s + Math.abs(p.avg_cost * p.quantity * 100), 0
    )
    const groupPnlPct = combinedCostBasis > 0 ? (combinedPnl / combinedCostBasis) * 100 : 0

    let groupLevel: 'green' | 'yellow' | 'red'
    if (g.positions.length === 1 && g.key.startsWith('_ungrouped_')) {
      // Single ungrouped position — pass through per-leg risk_level unchanged
      groupLevel = g.positions[0].risk_level as 'green' | 'yellow' | 'red'
    } else if (combinedPnl >= 0) {
      // Net profitable — NEVER red
      const allLegsGreen = g.positions.every(p => p.risk_level === 'green')
      groupLevel = allLegsGreen ? 'green' : 'yellow'
    } else {
      // Net losing — apply escalation bands
      if (groupPnlPct <= -100) {
        groupLevel = 'red'   // loss equals or exceeds total premium at risk
      } else if (groupPnlPct <= -50) {
        groupLevel = 'red'   // group-level stop-loss threshold
      } else {
        const minDte = Math.min(...g.positions.map(p => p.dte))
        if (minDte <= 7) {
          groupLevel = 'red'   // imminent expiry with net losing group
        } else {
          // Net losing but no red trigger — always at least yellow (see design §8 clarification)
          groupLevel = 'yellow'
        }
      }
    }

    return { ...g, worstLevel, combinedPnl, worstLegPnlPct, enteredAt, groupLevel, groupPnlPct }
  })

  // Sort: newest entered_at first (descending); tiebreak by groupLevel rank (red=0 sorts first)
  return groups.sort((a, b) => {
    if (b.enteredAt > a.enteredAt) return 1
    if (b.enteredAt < a.enteredAt) return -1
    return riskRank[a.groupLevel] - riskRank[b.groupLevel]
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

// ── Date grouping (D3 — left date rail) ───────────────────────────────────────

const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface DateBlock {
  date: string
  items: StrategyGroup[]
}

// Group consecutive strategy groups that share the same entry date into date-blocks.
// Groups are already sorted newest-first, so consecutive same-date entries cluster.
function groupByEntryDate(groups: StrategyGroup[]): DateBlock[] {
  const blocks: DateBlock[] = []
  for (const g of groups) {
    const last = blocks[blocks.length - 1]
    if (last && last.date === g.enteredAt) {
      last.items.push(g)
    } else {
      blocks.push({ date: g.enteredAt, items: [g] })
    }
  }
  return blocks
}

// Vertical date rail shown to the left of all trades entered on the same date.
function DateRail({ dateStr }: { dateStr: string }) {
  const parts = dateStr.split('-')
  const day = parts[2] ?? '—'
  const mon = parts[1] ? MONTH_ABBR[parseInt(parts[1], 10)] : ''
  return (
    <div style={{
      width: '54px',
      flexShrink: 0,
      background: C.bg,
      borderRight: `1px solid ${C.border}`,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '8px 4px',
      textAlign: 'center' as const,
    }}>
      <div style={{ fontSize: '18px', fontWeight: 800, color: '#a78bfa', lineHeight: 1 }}>{day}</div>
      <div style={{ fontSize: '9px', fontWeight: 700, color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginTop: '2px' }}>{mon}</div>
    </div>
  )
}

// ── RiskListRow ───────────────────────────────────────────────────────────────

function RiskListRow({ group, isSelected, onClick, isLast, showDateChip }: {
  group: StrategyGroup
  isSelected: boolean
  onClick: () => void
  isLast?: boolean
  showDateChip?: boolean
}) {
  const nearestDte = Math.min(...group.positions.map(p => p.dte))
  const borderColor = riskColor(group.groupLevel)

  // S3 — selected rows lift off the list with an accent glow ring + shadow
  const selectedStyle: React.CSSProperties = isSelected
    ? {
        background: '#1c1f3a',
        margin: '4px',
        borderRadius: '8px',
        borderLeft: `4px solid ${borderColor}`,
        boxShadow: `0 0 0 1px ${C.accent}, 0 4px 14px rgba(124,106,247,0.35)`,
        position: 'relative' as const,
        zIndex: 2,
      }
    : {
        background: C.surface,
        borderLeft: `3px solid ${borderColor}`,
        borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
      }

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px',
        cursor: 'pointer',
        transition: 'background 0.15s, box-shadow 0.15s',
        ...selectedStyle,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
        <span style={{
          fontSize: '12px',
          fontWeight: 700,
          color: isSelected ? '#ffffff' : C.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const,
          flex: 1,
          minWidth: 0,
        }}>
          {group.label}
        </span>
        <span style={{
          fontSize: '10px',
          fontWeight: 700,
          color: borderColor,
          background: riskBg(group.groupLevel),
          border: `1px solid ${borderColor}44`,
          padding: '1px 6px',
          borderRadius: '6px',
          whiteSpace: 'nowrap' as const,
          flexShrink: 0,
        }}>
          {riskLabel(group.groupLevel)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
        <span style={{ fontSize: '11px', color: C.muted }}>
          {nearestDte}d
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
      <MiniProgressBar worstLegPnlPct={group.groupPnlPct} level={group.groupLevel} />
      {showDateChip && group.enteredAt !== '' && (
        <div style={{
          marginTop: '5px',
          fontSize: '10px',
          color: C.muted,
          letterSpacing: '0.03em',
        }}>
          Entered {fmtChipDate(group.enteredAt)}
        </div>
      )}
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

  const name = group.label

  return (
    <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const, marginBottom: '6px' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: C.text }}>{name}</span>
        <span style={{
          fontSize: '10px',
          fontWeight: 700,
          color: riskColor(group.groupLevel),
          background: riskBg(group.groupLevel),
          border: `1px solid ${riskColor(group.groupLevel)}44`,
          padding: '2px 8px',
          borderRadius: '6px',
          textTransform: 'uppercase' as const,
        }}>
          {riskLabel(group.groupLevel)}
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
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '10px',
        }}>
          {sortedPositions.map((pos, i) => (
            <LegCard
              key={`${pos.symbol}-${pos.strike}-${pos.expiry}-${pos.option_type}-${i}`}
              pos={pos}
            />
          ))}
        </div>
        <ActionPlanBox group={group} stockPrices={stockPrices} />
      </div>
    </div>
  )
}

// ── SortBar ───────────────────────────────────────────────────────────────────

function SortBar({
  count,
  sortMode,
  onSortChange,
}: {
  count: number
  sortMode: SortMode
  onSortChange: (m: SortMode) => void
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '6px 12px',
      background: C.surface2,
      borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>
        Trades · {count}
      </span>
      <select
        value={sortMode}
        onChange={e => onSortChange(e.target.value as SortMode)}
        aria-label="Sort trades"
        onFocus={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.boxShadow = `0 0 0 1px ${C.accent}` }}
        onBlur={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = 'none' }}
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: '5px',
          color: C.text,
          fontSize: '11px',
          padding: '2px 6px',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <option value="newest">Newest first</option>
        <option value="risk">Risk first</option>
        <option value="pnl">Worst P&amp;L first</option>
      </select>
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
  const [sortMode, setSortMode] = useState<SortMode>('newest')

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
  const sortedGroups = sortGroups(groups, sortMode)
  const selectedGroup = sortedGroups.find(g => g.key === selectedGroupKey) ?? null

  // ── Desktop split layout ──────────────────────────────────────────────────

  const renderDesktopSplit = () => {
    return (
      <div style={{
        display: 'flex',
        maxHeight: 'calc(100vh - 260px)',
        overflow: 'hidden',
        borderTop: `1px solid ${C.border}`,
      }}>
        {/* Left column wrapper — flex column so SortBar sits above the scroll div */}
        <div style={{
          width: '290px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: `1px solid ${C.border}`,
          background: C.bg,
        }}>
          {/* SortBar — pinned above the scroll list, does not scroll */}
          <SortBar count={sortedGroups.length} sortMode={sortMode} onSortChange={setSortMode} />

          {/* Scrollable list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {sortMode === 'newest' ? (
              groupByEntryDate(sortedGroups).map((block, bi) => (
                <div key={block.date || `blk-${bi}`} style={{ display: 'flex', borderTop: bi > 0 ? `1px solid ${C.border}` : 'none' }}>
                  <DateRail dateStr={block.date} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const }}>
                    {block.items.map((group, gi) => (
                      <RiskListRow
                        key={group.key}
                        group={group}
                        isSelected={group.key === selectedGroupKey}
                        onClick={() => setSelectedGroupKey(group.key)}
                        isLast={gi === block.items.length - 1}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              sortedGroups.map((group, gi) => (
                <RiskListRow
                  key={group.key}
                  group={group}
                  isSelected={group.key === selectedGroupKey}
                  onClick={() => setSelectedGroupKey(group.key)}
                  isLast={gi === sortedGroups.length - 1}
                  showDateChip
                />
              ))
            )}
          </div>
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
    return (
      <div style={{ borderTop: `1px solid ${C.border}` }}>
        {/* SortBar — non-sticky, scrolls with the list */}
        <SortBar count={sortedGroups.length} sortMode={sortMode} onSortChange={setSortMode} />

        {sortMode === 'newest' ? (
          groupByEntryDate(sortedGroups).map((block, bi) => (
            <div key={block.date || `blk-${bi}`} style={{ display: 'flex', borderTop: bi > 0 ? `1px solid ${C.border}` : 'none' }}>
              <DateRail dateStr={block.date} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const }}>
                {block.items.map((group, gi) => {
                  const isExpanded = mobileExpandedKey === group.key
                  return (
                    <React.Fragment key={group.key}>
                      <RiskListRow
                        group={group}
                        isSelected={isExpanded}
                        onClick={() => setMobileExpandedKey(isExpanded ? null : group.key)}
                        isLast={gi === block.items.length - 1 && !isExpanded}
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
            </div>
          ))
        ) : (
          sortedGroups.map((group, gi) => {
            const isExpanded = mobileExpandedKey === group.key
            return (
              <React.Fragment key={group.key}>
                <RiskListRow
                  group={group}
                  isSelected={isExpanded}
                  onClick={() => setMobileExpandedKey(isExpanded ? null : group.key)}
                  isLast={gi === sortedGroups.length - 1 && !isExpanded}
                  showDateChip
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
          })
        )}
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
