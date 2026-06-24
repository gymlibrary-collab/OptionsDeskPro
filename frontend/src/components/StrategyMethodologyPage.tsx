import React from 'react'

interface Props {
  onTabChange?: (tab: string) => void
}

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  surface2: '#252836',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#f59e0b',
}

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>{title}</span>
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {children}
      </div>
    </div>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: '13px', color: C.muted, lineHeight: 1.75, margin: 0 }}>{children}</p>
}

function GateBox({ color, label, subtitle, children }: { color: string; label: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, background: C.bg, borderLeft: `3px solid ${color}`, borderRadius: '0 6px 6px 0', padding: '12px 14px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '10px', color: C.muted, marginBottom: '6px' }}>{subtitle}</div>
      <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

export default function StrategyMethodologyPage({ onTabChange: _onTabChange }: Props) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      maxWidth: '820px',
      margin: '0 auto',
      padding: '8px 0 32px',
      fontFamily: font,
      color: C.text,
    }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: C.text, margin: '0 0 6px' }}>
          The Engine Behind the Recommendations
        </h1>
        <p style={{ fontSize: '14px', color: C.muted, margin: 0 }}>
          Options Compass doesn't guess. Every recommendation is the output of a structured analytical
          pipeline applied consistently across all symbols.
        </p>
      </div>

      {/* Section 1 */}
      <SectionCard title="Why volatility comes first">
        <Body>
          Most retail traders pick strategies based on direction alone — "I think AAPL goes up, so I'll
          buy a call." This ignores the single most important variable in options pricing: implied
          volatility. Options Compass measures where current volatility sits relative to its own history,
          and this measurement gates the entire strategy selection process. A bullish strategy that works
          in a low-IV environment can be exactly the wrong choice in a high-IV environment, even if the
          directional call is correct.
        </Body>
      </SectionCard>

      {/* Section 2 */}
      <SectionCard title="The two-gate selection process">
        <Body>
          Selection works in two sequential gates. The first gate is a hard filter on the volatility
          environment — any strategy whose structure conflicts with the current IV regime is excluded
          completely, regardless of how well it matches the directional signal. The second gate applies
          the directional filter to the strategies that passed gate one.
        </Body>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
          <GateBox color={C.accent} label="Gate 1 — Volatility" subtitle="Hard exclusion">
            Mismatched strategies are not ranked lower — they are removed entirely.
          </GateBox>
          <GateBox color={C.yellow} label="Gate 2 — Direction" subtitle="Soft ranking">
            Exact matches score highest; adjacent-compatible setups receive partial credit.
          </GateBox>
        </div>
        <Body>
          This is why you can see many strategies pass Gate 1 but none pass Gate 2 — the market
          direction may be ambiguous or conflicting while the volatility environment is clear. Gate 1
          strategies are still valid candidates; Gate 2 tells you how well the current directional signal
          aligns with each one.
        </Body>
      </SectionCard>

      {/* Section 3 */}
      <SectionCard title="31 strategies — not a shortlist">
        <Body>
          The full catalog covers every major options strategy family: income strategies for sideways
          markets, directional spreads, diagonal and calendar structures, back-ratio spreads, and complex
          multi-leg setups. Each strategy is defined by its natural volatility environment and directional
          stance — these are fixed attributes grounded in established options education frameworks, not
          arbitrary parameters. The engine does not cherry-pick; it evaluates all 31 consistently on
          every scan.
        </Body>
      </SectionCard>

      {/* Section 4 */}
      <SectionCard title="Only viable trades reach you">
        <Body>
          After a strategy is selected, strikes are calculated at current market prices. The engine then
          applies viability guards: if the constructed trade is mechanically broken at today's prices —
          the max profit is zero or negative, or a debit strategy requires risking more than you can gain
          — the strategy is suppressed entirely. No warning is shown; the strategy simply does not appear.
          This prevents the common trap of surfacing technically-matching strategies that are not
          executable in practice.
        </Body>
      </SectionCard>

      {/* Section 5 */}
      <SectionCard title="Earnings-aware execution">
        <Body>
          When an upcoming earnings event falls within the trade window, expiry selection adjusts
          automatically. Premium sellers are routed to the last expiry before the announcement — avoiding
          the IV crush that typically follows an earnings release. Premium buyers are routed to the first
          expiry after, to capture the post-announcement directional move. This adjustment happens
          silently and is noted on the trade card when it applies.
        </Body>
      </SectionCard>

      {/* Section 6 */}
      <SectionCard title="Context layers — narrative enrichment only">
        <Body>
          After strategy selection is complete, additional context is gathered — upcoming earnings dates,
          unusual options activity, put/call ratios, and recent news sentiment. These signals do not
          change which strategies are ranked or how they score. They feed the AI-generated plain-English
          narrative that accompanies each recommendation, giving you the situational context to judge
          whether the mechanical fit translates to a sensible trade right now.
        </Body>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
          {[
            { label: 'Earnings Awareness', desc: 'Expiry selection adjusts automatically around upcoming earnings dates.' },
            { label: 'Options Flow', desc: 'Unusual volume, put/call ratio, and large sweeps feed the AI narrative.' },
            { label: 'News & Sentiment', desc: 'Recent headlines and Reddit sentiment provide situational context.' },
          ].map(({ label, desc }) => (
            <div key={label} style={{ flex: '1 1 180px', background: C.bg, borderRadius: '6px', padding: '10px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </SectionCard>

    </div>
  )
}
