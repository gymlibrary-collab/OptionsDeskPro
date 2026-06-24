import React from 'react'

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

const sectionCard: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '10px',
  padding: '24px 28px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const sectionTitle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 700,
  color: C.text,
  borderBottom: `1px solid ${C.border}`,
  paddingBottom: '10px',
  marginBottom: '4px',
}

const bodyText: React.CSSProperties = {
  fontSize: '14px',
  color: C.muted,
  lineHeight: '1.7',
}

const formula: React.CSSProperties = {
  background: C.surface2,
  border: `1px solid ${C.border}`,
  borderRadius: '6px',
  padding: '10px 14px',
  fontFamily: 'monospace',
  fontSize: '13px',
  color: C.text,
  overflowX: 'auto' as const,
}

const th: React.CSSProperties = {
  textAlign: 'left' as const,
  padding: '8px 14px',
  fontSize: '11px',
  fontWeight: 700,
  color: C.muted,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: 'nowrap' as const,
  background: C.surface2,
}

const td: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: '13px',
  color: C.text,
  borderBottom: `1px solid ${C.border}22`,
  verticalAlign: 'middle' as const,
}

function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-block',
      background: bg,
      color,
      border: `1px solid ${color}44`,
      borderRadius: '4px',
      padding: '2px 8px',
      fontSize: '11px',
      fontWeight: 700,
    }}>
      {text}
    </span>
  )
}

function DirectionCell({ dir }: { dir: string }) {
  if (dir.startsWith('NEUTRAL_BULLISH')) return <span style={{ color: '#86efac', fontWeight: 600, fontSize: '12px' }}>{dir}</span>
  if (dir.startsWith('NEUTRAL_BEARISH')) return <span style={{ color: '#fca5a5', fontWeight: 600, fontSize: '12px' }}>{dir}</span>
  if (dir === 'BULLISH') return <span style={{ color: C.green, fontWeight: 600, fontSize: '12px' }}>BULLISH</span>
  if (dir === 'BEARISH') return <span style={{ color: C.red, fontWeight: 600, fontSize: '12px' }}>BEARISH</span>
  if (dir === 'NEUTRAL') return <span style={{ color: C.yellow, fontWeight: 600, fontSize: '12px' }}>NEUTRAL</span>
  if (dir === 'OMNIDIRECTIONAL' || dir.startsWith('OMNI')) return <span style={{ color: C.accent, fontWeight: 600, fontSize: '12px' }}>{dir}</span>
  return <span style={{ color: C.muted, fontSize: '12px' }}>{dir}</span>
}

const catalog: {
  num: number
  name: string
  dir: string
  iv: string
  dte: string
  pop: string
  family: string
}[] = [
  { num: 1,  name: 'Covered Call',               dir: 'BULLISH',         iv: 'HIGH', dte: '45',    pop: '50–70%', family: 'covered' },
  { num: 2,  name: 'Long Call Vertical Spread',   dir: 'BULLISH',         iv: 'ANY',  dte: '45',    pop: '40–60%', family: 'debit_spread' },
  { num: 3,  name: 'Call ZEBRA',                  dir: 'BULLISH',         iv: 'ANY',  dte: 'ANY',   pop: '50%',    family: 'back_ratio' },
  { num: 4,  name: "Poor Man's Covered Call",     dir: 'BULLISH',         iv: 'LOW',  dte: '45–60', pop: '50–60%', family: 'diagonal' },
  { num: 5,  name: 'Call Calendar Spread',        dir: 'NEUTRAL_BULLISH*',iv: 'LOW*', dte: '45',    pop: '—',      family: 'calendar' },
  { num: 6,  name: 'Call Butterfly',              dir: 'BULLISH',         iv: 'ANY',  dte: '15–45', pop: '20–40%', family: 'butterfly' },
  { num: 7,  name: 'Big Lizard',                  dir: 'BULLISH',         iv: 'HIGH', dte: '45',    pop: '60–80%', family: 'naked_with_spread' },
  { num: 8,  name: 'Covered Put',                 dir: 'BEARISH',         iv: 'HIGH', dte: '45',    pop: '50–70%', family: 'covered' },
  { num: 9,  name: 'Long Put Vertical Spread',    dir: 'BEARISH',         iv: 'ANY',  dte: '45',    pop: '50–60%', family: 'debit_spread' },
  { num: 10, name: 'Put ZEBRA',                   dir: 'BEARISH',         iv: 'ANY',  dte: 'ANY',   pop: '50%',    family: 'back_ratio' },
  { num: 11, name: "Poor Man's Covered Put",      dir: 'BEARISH',         iv: 'LOW',  dte: '45–60', pop: '50–60%', family: 'diagonal' },
  { num: 12, name: 'Put Calendar Spread',         dir: 'NEUTRAL_BEARISH*',iv: 'LOW*', dte: '45',    pop: '—',      family: 'calendar' },
  { num: 13, name: 'Put Butterfly',               dir: 'BEARISH',         iv: 'ANY',  dte: '15–45', pop: '20–40%', family: 'butterfly' },
  { num: 14, name: 'Reverse Big Lizard',          dir: 'BEARISH',         iv: 'HIGH', dte: '45',    pop: '60–80%', family: 'naked_with_spread' },
  { num: 15, name: 'Put Front-Ratio Spread',      dir: 'OMNIDIRECTIONAL', iv: 'HIGH', dte: '15–45', pop: '60–80%', family: 'ratio_spread' },
  { num: 16, name: 'Call Front-Ratio Spread',     dir: 'OMNIDIRECTIONAL', iv: 'HIGH', dte: '15–45', pop: '60–80%', family: 'ratio_spread' },
  { num: 17, name: 'Put Broken Wing Butterfly',   dir: 'OMNIDIRECTIONAL*',iv: 'HIGH', dte: '15–45', pop: '60–80%', family: 'broken_wing_butterfly' },
  { num: 18, name: 'Call Broken Wing Butterfly',  dir: 'OMNIDIRECTIONAL*',iv: 'HIGH', dte: '15–45', pop: '60–80%', family: 'broken_wing_butterfly' },
  { num: 19, name: 'Call Broken Heart Butterfly', dir: 'OMNIDIRECTIONAL', iv: 'HIGH', dte: '45',    pop: '60–80%', family: 'broken_wing_butterfly' },
  { num: 20, name: 'Put Broken Heart Butterfly',  dir: 'OMNIDIRECTIONAL', iv: 'HIGH', dte: '45',    pop: '60–80%', family: 'broken_wing_butterfly' },
  { num: 21, name: 'Short Strangle',              dir: 'NEUTRAL',         iv: 'HIGH', dte: '45',    pop: '60–80%', family: 'naked_double' },
  { num: 22, name: 'Short Straddle',              dir: 'NEUTRAL',         iv: 'HIGH', dte: '45',    pop: '50–60%', family: 'naked_double' },
  { num: 23, name: 'Iron Condor',                 dir: 'NEUTRAL',         iv: 'HIGH', dte: '45',    pop: '60–80%', family: 'iron_condor' },
  { num: 24, name: 'Dynamic Width Iron Condor',   dir: 'NEUTRAL',         iv: 'HIGH', dte: '45',    pop: '60–80%', family: 'iron_condor' },
  { num: 25, name: 'Iron Fly',                    dir: 'NEUTRAL',         iv: 'HIGH', dte: '45',    pop: '60–80%', family: 'iron_fly' },
  { num: 26, name: 'Short Naked Put',             dir: 'NEUTRAL_BULLISH', iv: 'HIGH', dte: '45',    pop: '60–80%', family: 'naked_single' },
  { num: 27, name: 'Short Put Vertical Spread',   dir: 'NEUTRAL_BULLISH', iv: 'HIGH', dte: '45',    pop: '60–80%', family: 'credit_spread' },
  { num: 28, name: 'Jade Lizard',                 dir: 'NEUTRAL_BULLISH', iv: 'HIGH', dte: '45',    pop: '60–80%', family: 'naked_with_spread' },
  { num: 29, name: 'Short Naked Call',            dir: 'NEUTRAL_BEARISH', iv: 'HIGH', dte: '45',    pop: '60–80%', family: 'naked_single' },
  { num: 30, name: 'Short Call Vertical Spread',  dir: 'NEUTRAL_BEARISH', iv: 'HIGH', dte: '45',    pop: '60–80%', family: 'credit_spread' },
  { num: 31, name: 'Reverse Jade Lizard',         dir: 'NEUTRAL_BEARISH', iv: 'HIGH', dte: '45',    pop: '60–80%', family: 'naked_with_spread' },
]

export default function StrategyMethodologyAdmin() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      maxWidth: '900px',
      margin: '0 auto',
      padding: '8px 0 32px',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace",
      color: C.text,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: C.text, margin: 0 }}>
          Strategy Selection Methodology
        </h1>
        <p style={{ fontSize: '14px', color: C.muted, margin: 0 }}>
          How Options Compass selects the right options strategies for any market condition
        </p>
        <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>
          Source: tastylive Options Strategy Guide (2023)
        </p>
      </div>

      {/* Section 1 — How selection works */}
      <div style={sectionCard}>
        <div style={sectionTitle}>1. How selection works</div>
        <p style={bodyText}>
          The engine reduces all market information down to exactly two computed inputs. Everything else is attached
          after a strategy is chosen — those outputs never influence which strategies get ranked.
        </p>

        {/* Pipeline visual */}
        <div style={{
          background: C.surface2,
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          padding: '16px 20px',
          fontFamily: 'monospace',
          fontSize: '13px',
          color: C.text,
          lineHeight: '2',
          overflowX: 'auto' as const,
        }}>
          <div>
            Market Data <span style={{ color: C.muted }}>&rarr;</span>{' '}
            <span style={{ color: C.accent }}>[1] IV Environment</span>{' '}
            <span style={{ color: C.muted }}> ─┐</span>
          </div>
          <div style={{ paddingLeft: '132px', color: C.muted }}>
            ├<span style={{ color: C.accent }}>&rarr; Score &amp; Rank &rarr; Top 5 &rarr; Attach DTE / POP / P&amp;L</span>
          </div>
          <div>
            Market Data <span style={{ color: C.muted }}>&rarr;</span>{' '}
            <span style={{ color: C.accent }}>[2] Directional Bias</span>
            <span style={{ color: C.muted }}> ─┘</span>
          </div>
        </div>

        <p style={bodyText}>
          DTE (45 days), Probability of Profit, and Max Profit/Loss are <strong style={{ color: C.text }}>outputs</strong> attached
          after a strategy is chosen. They are never used as scoring inputs and do not affect rank.
        </p>

        {/* Two-gate explanation */}
        <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>What the numbers in scan results mean</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{
            background: C.surface2, border: `1px solid ${C.border}`,
            borderRadius: '6px', padding: '12px 16px',
            display: 'flex', flexDirection: 'column', gap: '4px',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: C.accent, whiteSpace: 'nowrap' as const }}>Gate 1 → "Strategies Available"</span>
              <span style={{ fontSize: '11px', color: C.muted }}>hard IV filter</span>
            </div>
            <p style={{ fontSize: '12px', color: C.muted, margin: 0, lineHeight: '1.6' }}>
              Count of strategies whose <strong style={{ color: C.text }}>IV environment tag</strong> matches the current IV environment.
              A strategy with no IV match is excluded entirely — it cannot appear in results regardless of direction.
            </p>
          </div>
          <div style={{
            background: C.surface2, border: `1px solid ${C.border}`,
            borderRadius: '6px', padding: '12px 16px',
            display: 'flex', flexDirection: 'column', gap: '4px',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: C.yellow, whiteSpace: 'nowrap' as const }}>Gate 2 → "Condition Matches"</span>
              <span style={{ fontSize: '11px', color: C.muted }}>soft direction match</span>
            </div>
            <p style={{ fontSize: '12px', color: C.muted, margin: 0, lineHeight: '1.6' }}>
              Count of Gate 1 strategies that also match the current <strong style={{ color: C.text }}>directional bias</strong> (exactly or via adjacent compatibility).
              Strategies outside this count still appear but rank lower.
            </p>
          </div>
        </div>
        <p style={{ ...bodyText, fontSize: '12px' }}>
          Earnings data and options flow do <strong style={{ color: C.text }}>not</strong> change either count — they enrich the AI narrative only.
        </p>
      </div>

      {/* Section 2 — IV Environment */}
      <div style={sectionCard}>
        <div style={sectionTitle}>2. Input 1: IV Environment</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={bodyText}>
            One year of daily closing prices is downloaded. The engine computes a 30-day rolling Historical
            Volatility (HV), annualised, and records the 52-week high and low of that rolling series.
          </p>

          <div style={formula}>
            HV = stdev(log returns, sample) &times; &radic;252
          </div>
          <div style={formula}>
            IVR = (current HV &minus; 52wk low) / (52wk high &minus; 52wk low) &times; 100
          </div>

          <p style={{ ...bodyText, fontSize: '12px' }}>
            Note: HV is used as a proxy because live implied volatility history is not available from the free data tier.
          </p>
        </div>

        {/* Classification thresholds */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' as const }}>
          <div style={{
            flex: '1 1 180px',
            background: '#2d0f0f',
            border: `1px solid ${C.red}44`,
            borderRadius: '8px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Badge text="HIGH" color={C.red} bg="#2d0f0f" />
              <span style={{ fontSize: '12px', color: C.muted }}>IVR &gt; 50</span>
            </div>
            <p style={{ fontSize: '12px', color: C.muted, margin: 0, lineHeight: '1.5' }}>
              Favour <strong style={{ color: C.text }}>selling premium</strong> — short strangles, iron condors, credit spreads
            </p>
          </div>
          <div style={{
            flex: '1 1 180px',
            background: '#2d1f0f',
            border: `1px solid ${C.yellow}44`,
            borderRadius: '8px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Badge text="MEDIUM" color={C.yellow} bg="#2d1f0f" />
              <span style={{ fontSize: '12px', color: C.muted }}>IVR 30–50</span>
            </div>
            <p style={{ fontSize: '12px', color: C.muted, margin: 0, lineHeight: '1.5' }}>
              Balanced; <strong style={{ color: C.text }}>defined-risk spreads</strong> work well in either direction
            </p>
          </div>
          <div style={{
            flex: '1 1 180px',
            background: '#0f2d1a',
            border: `1px solid ${C.green}44`,
            borderRadius: '8px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Badge text="LOW" color={C.green} bg="#0f2d1a" />
              <span style={{ fontSize: '12px', color: C.muted }}>IVR &lt; 30</span>
            </div>
            <p style={{ fontSize: '12px', color: C.muted, margin: 0, lineHeight: '1.5' }}>
              Favour <strong style={{ color: C.text }}>buying premium</strong> — verticals, calendars, poor man's strategies
            </p>
          </div>
        </div>
      </div>

      {/* Section 3 — Directional Bias */}
      <div style={sectionCard}>
        <div style={sectionTitle}>3. Input 2: Directional Bias</div>

        <p style={bodyText}>
          Three months of daily closing prices drive two technical indicators: an SMA-20/SMA-50 crossover and RSI(14).
          Their signals are combined into a single bias output.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>SMA signal rules</div>
          <div style={formula}>
            price &gt; SMA20 &gt; SMA50 &rarr; BULLISH{'\n'}
            price &lt; SMA20 &lt; SMA50 &rarr; BEARISH{'\n'}
            otherwise               &rarr; NEUTRAL
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>RSI(14) tilt</div>
          <div style={formula}>
            RSI &gt; 60 &rarr; bullish tilt{'\n'}
            RSI &lt; 40 &rarr; bearish tilt{'\n'}
            40–60      &rarr; neutral
          </div>
        </div>

        <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>Combination rules</div>
        <div style={{ overflowX: 'auto' as const }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '500px' }}>
            <thead>
              <tr>
                <th style={th}>SMA Signal</th>
                <th style={th}>RSI Signal</th>
                <th style={th}>Output Bias</th>
                <th style={th}>Strength</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['BULLISH', 'bullish', 'BULLISH', 'STRONG'],
                ['BEARISH', 'bearish', 'BEARISH', 'STRONG'],
                ['BULLISH', 'neutral', 'NEUTRAL_BULLISH', 'MODERATE'],
                ['BEARISH', 'neutral', 'NEUTRAL_BEARISH', 'MODERATE'],
                ['neutral', 'bullish', 'NEUTRAL_BULLISH', 'MODERATE'],
                ['neutral', 'bearish', 'NEUTRAL_BEARISH', 'MODERATE'],
                ['conflicting or both neutral', '—', 'NEUTRAL', 'MODERATE'],
              ].map(([sma, rsi, out, str], i) => (
                <tr key={i}>
                  <td style={td}><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{sma}</span></td>
                  <td style={td}><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{rsi}</span></td>
                  <td style={td}><DirectionCell dir={out} /></td>
                  <td style={{ ...td, color: str === 'STRONG' ? C.green : C.yellow, fontWeight: 600, fontSize: '12px' }}>{str}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4 — Scoring algorithm */}
      <div style={sectionCard}>
        <div style={sectionTitle}>4. Scoring algorithm</div>

        <p style={bodyText}>
          Each strategy in the catalog is scored against the current (IV environment, directional bias) pair.
          Strategies that match on neither axis are excluded entirely. The top 5 by score are returned.
        </p>

        <div style={{
          background: C.surface2,
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: C.green, minWidth: '36px' }}>+2</span>
            <span style={{ fontSize: '13px', color: C.text }}>IV environment matches the strategy's IV tag</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: C.green, minWidth: '36px' }}>+3</span>
            <span style={{ fontSize: '13px', color: C.text }}>Direction matches exactly (e.g. market is BULLISH, strategy is BULLISH)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: C.yellow, minWidth: '36px' }}>+1</span>
            <span style={{ fontSize: '13px', color: C.text }}>Direction matches an adjacent compatible bias (partial match)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: C.red, minWidth: '36px' }}>−0.1</span>
            <span style={{ fontSize: '13px', color: C.text }}>&times; complexity (1–3) as tiebreaker — simpler strategies rank first among equals</span>
          </div>
        </div>

        <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>Bias compatibility map</div>
        <div style={{ overflowX: 'auto' as const }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '420px' }}>
            <thead>
              <tr>
                <th style={th}>Your market bias</th>
                <th style={th}>Strategies that score</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['BULLISH',         'Bullish strategies (+3), then adjacent compatible'],
                ['BEARISH',         'Bearish strategies (+3), then adjacent compatible'],
                ['NEUTRAL',         'Neutral strategies (+3), OMNIDIRECTIONAL at +1'],
                ['NEUTRAL_BULLISH', 'Neutral-Bullish (+3), Bullish (+1), Neutral (+1)'],
                ['NEUTRAL_BEARISH', 'Neutral-Bearish (+3), Bearish (+1), Neutral (+1)'],
              ].map(([bias, desc], i) => (
                <tr key={i}>
                  <td style={td}><DirectionCell dir={bias} /></td>
                  <td style={{ ...td, color: C.muted, fontSize: '12px' }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Worked example callout */}
        <div style={{
          background: '#1a1030',
          border: `1px solid ${C.accent}44`,
          borderRadius: '8px',
          padding: '14px 18px',
          fontSize: '13px',
          color: C.text,
          lineHeight: '1.6',
        }}>
          <strong style={{ color: C.accent }}>Worked example:</strong>{' '}
          IVR = 64 (HIGH) + NEUTRAL bias &rarr; iron_condor scores{' '}
          <span style={{ fontFamily: 'monospace' }}>2 + 3 &minus; 0.2 =</span>{' '}
          <strong style={{ color: C.green }}>4.8</strong>
        </div>
      </div>

      {/* Section 4b — Viability Guards */}
      <div style={sectionCard}>
        <div style={sectionTitle}>4b. Viability Guards — Why a Strategy May Be Suppressed</div>

        <p style={bodyText}>
          After strike selection, the engine checks whether the trade is viable at current market prices.
          A strategy may be suppressed (not shown in results) even if it matches the IV environment and
          directional bias. This is intentional — showing a trade that cannot make money teaches bad habits.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{
            background: C.surface2, border: `1px solid ${C.red}44`,
            borderRadius: '6px', padding: '14px 16px',
            display: 'flex', flexDirection: 'column', gap: '6px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: C.red }}>Guard 1 — Non-positive max profit</div>
            <p style={{ ...bodyText, margin: 0 }}>
              If the computed <strong style={{ color: C.text }}>max profit ≤ 0</strong> at the selected strikes,
              the strategy is suppressed. A trade that can never make money — regardless of market movement —
              should not be presented as a recommendation.
            </p>
            <div style={formula}>if max_profit is not None and max_profit &lt;= 0: suppress</div>
          </div>

          <div style={{
            background: C.surface2, border: `1px solid ${C.yellow}44`,
            borderRadius: '6px', padding: '14px 16px',
            display: 'flex', flexDirection: 'column', gap: '6px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: C.yellow }}>Guard 2 — Debit with unfavourable risk/reward</div>
            <p style={{ ...bodyText, margin: 0 }}>
              For defined-risk <strong style={{ color: C.text }}>debit strategies</strong> (you pay to enter),
              the engine requires <strong style={{ color: C.text }}>max profit ≥ max loss</strong>. If the debit
              paid is more than the maximum you can make, the strategy is suppressed — you would be risking
              more than you can gain.
            </p>
            <div style={formula}>if net &lt; 0 and DEFINED and max_profit &lt; max_loss: suppress</div>
          </div>
        </div>

        <p style={{ ...bodyText, fontSize: '12px' }}>
          Suppressed strategies are simply absent from results — they do not appear with a warning banner.
          The same strategy becomes viable again when implied volatility or the underlying price changes
          enough to shift the at-the-money strikes into a favourable R/R zone. For example, a Long Put Vertical
          may be suppressed in a 30% IV environment but viable again when IV falls to 20%.
        </p>

        <div style={{
          background: '#1a1030',
          border: `1px solid ${C.accent}44`,
          borderRadius: '8px',
          padding: '14px 18px',
          fontSize: '13px',
          color: C.text,
          lineHeight: '1.6',
        }}>
          <strong style={{ color: C.accent }}>ZEBRA back-ratios:</strong>{' '}
          Call ZEBRA and Put ZEBRA are 2:1 back-ratio spreads (buy 2 options, sell 1).
          Above the short strike you are net long two contracts — profit increases without bound.
          Their max profit is therefore <span style={{ fontFamily: 'monospace' }}>None</span> (unlimited),
          and max loss equals the debit paid. Guard 2 does not apply to them.
        </div>
      </div>

      {/* Section 5 — The 31-Strategy Catalog */}
      <div style={sectionCard}>
        <div style={sectionTitle}>5. The 31-Strategy Catalog</div>

        <p style={bodyText}>
          Every strategy carries fixed selection attributes (Direction, IV Env). DTE, POP, and P&L Family
          are attached after selection — they do not influence rank.
        </p>

        <div style={{ overflowX: 'auto' as const, border: `1px solid ${C.border}`, borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '700px' }}>
            <thead>
              <tr>
                {['#', 'Strategy', 'Direction', 'IV Env', 'DTE', 'POP', 'P&L Family'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const groupHeaders: Record<number, string> = { 1: 'Bullish', 8: 'Bearish', 15: 'Omnidirectional', 21: 'Neutral / Income', 26: 'Neutral-Bullish', 29: 'Neutral-Bearish' }
                const groupColors: Record<string, string> = { 'Bullish': C.green, 'Bearish': C.red, 'Omnidirectional': C.accent, 'Neutral / Income': C.yellow, 'Neutral-Bullish': '#86efac', 'Neutral-Bearish': '#fca5a5' }
                return catalog.flatMap((row, i) => {
                  const header = groupHeaders[row.num]
                  const rows = []
                  if (header) {
                    rows.push(
                      <tr key={`g-${row.num}`}>
                        <td colSpan={7} style={{
                          padding: '8px 14px 6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: groupColors[header],
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.08em',
                          background: C.surface,
                          borderTop: `2px solid ${C.border}`,
                          borderBottom: `1px solid ${C.border}33`,
                        }}>
                          {header}
                        </td>
                      </tr>
                    )
                  }
                  rows.push(
                    <tr key={row.num} style={{ borderBottom: i < catalog.length - 1 ? `1px solid ${C.border}22` : 'none' }}>
                      <td style={{ ...td, color: C.muted, fontVariantNumeric: 'tabular-nums', width: '32px' }}>{row.num}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{row.name}</td>
                      <td style={td}><DirectionCell dir={row.dir} /></td>
                      <td style={{ ...td, fontSize: '12px', color: C.muted }}>{row.iv}</td>
                      <td style={{ ...td, fontSize: '12px', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{row.dte}</td>
                      <td style={{ ...td, fontSize: '12px', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{row.pop}</td>
                      <td style={{ ...td, fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{row.family}</td>
                    </tr>
                  )
                  return rows
                })
              })()}
            </tbody>
          </table>
        </div>

        <p style={{ fontSize: '11px', color: '#64748b', margin: 0, lineHeight: '1.5' }}>
          * Engine divergence from literal guide tags (reviewed). See docs/strategy-selection-spec.md §6.
        </p>
      </div>

      {/* Section 6 — Earnings Awareness */}
      <div style={sectionCard}>
        <div style={sectionTitle}>6. Earnings Awareness</div>

        <p style={bodyText}>
          The system pulls the next earnings date from the data feed. When that date falls within the current
          45-day DTE window, the engine adjusts expiry selection — earnings outside that window are ignored.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{
            background: C.surface2,
            border: `1px solid ${C.border}`,
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>Premium sellers (HIGH IV strategies)</div>
            <p style={{ fontSize: '13px', color: C.muted, margin: 0, lineHeight: '1.6' }}>
              Trade uses the last expiry <strong style={{ color: C.text }}>before</strong> earnings (minimum 7 DTE) to avoid IV crush risk.
              If no suitable pre-earnings expiry is available, the first post-earnings expiry is used at half allocation.
            </p>
          </div>
          <div style={{
            background: C.surface2,
            border: `1px solid ${C.border}`,
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>Premium buyers (LOW IV / debit strategies)</div>
            <p style={{ fontSize: '13px', color: C.muted, margin: 0, lineHeight: '1.6' }}>
              Trade uses the first expiry <strong style={{ color: C.text }}>after</strong> earnings to capture the
              post-announcement directional move.
            </p>
          </div>
        </div>

        <p style={{ ...bodyText, fontSize: '12px' }}>
          When earnings awareness adjusts the expiry, a note appears on the trade card to make the adjustment visible to the user.
        </p>
      </div>

      {/* Section 7 — Options Flow & Sentiment */}
      <div style={sectionCard}>
        <div style={sectionTitle}>7. Options Flow & Sentiment</div>

        <p style={bodyText}>
          Two additional context signals enrich the AI narrative but do not affect strategy rank:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{
            background: C.surface2,
            border: `1px solid ${C.border}`,
            borderRadius: '6px',
            padding: '12px 16px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: C.text, marginBottom: '4px' }}>Reddit Sentiment</div>
            <p style={{ fontSize: '13px', color: C.muted, margin: 0, lineHeight: '1.6' }}>
              Aggregated from major finance subreddits. Appears on the Trading Desk tab and in the AI narrative section.
            </p>
          </div>
          <div style={{
            background: C.surface2,
            border: `1px solid ${C.border}`,
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>Put/Call Ratio (PCR)</div>
            <p style={{ fontSize: '13px', color: C.muted, margin: 0, lineHeight: '1.6' }}>
              Aggregated put volume divided by call volume across the options chain. Interpreted as:
            </p>
            <div style={{ overflowX: 'auto' as const }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '380px' }}>
                <thead>
                  <tr>
                    <th style={th}>PCR range</th>
                    <th style={th}>Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['< 0.6',      'Strongly bullish (heavy call buying)'],
                    ['0.6 – 0.85', 'Bullish'],
                    ['0.85 – 1.1', 'Neutral'],
                    ['1.1 – 1.5',  'Bearish'],
                    ['> 1.5',      'Strongly bearish (heavy put buying)'],
                  ].map(([range, signal], i) => (
                    <tr key={i}>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>{range}</td>
                      <td style={{ ...td, color: C.muted, fontSize: '12px' }}>{signal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{
            background: C.surface2,
            border: `1px solid ${C.border}`,
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex', flexDirection: 'column', gap: '6px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>Unusual Options Activity</div>
            <p style={{ fontSize: '13px', color: C.muted, margin: 0, lineHeight: '1.6' }}>
              A contract is flagged as unusual when{' '}
              <span style={{ fontFamily: 'monospace', background: C.bg, padding: '1px 6px', borderRadius: '3px', color: C.text }}>
                volume &gt; open interest AND volume &gt; 500
              </span>.
              Large sweeps and block trades meeting this threshold provide additional market context and appear in the AI narrative.
            </p>
          </div>
        </div>

        <div style={{
          background: '#0f2d1a',
          border: `1px solid ${C.green}33`,
          borderRadius: '6px',
          padding: '10px 14px',
          fontSize: '12px',
          color: C.muted,
        }}>
          Flow data <strong style={{ color: C.text }}>does not affect strategy selection rank</strong> — it enriches the
          plain-English narrative that accompanies each recommendation.
        </div>
      </div>

    </div>
  )
}
