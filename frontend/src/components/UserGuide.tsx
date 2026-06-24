import { useState } from 'react'

interface Props {
  isAdmin: boolean
  userRole?: 'owner' | 'support' | 'finance'
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
  amber: '#f59e0b',
  blue: '#38bdf8',
}

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

function Section({ title, badge, children, defaultOpen = false }: {
  title: string
  badge?: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden', marginBottom: '10px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          background: C.surface,
          border: 'none',
          color: C.text,
          fontSize: '14px',
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: font,
          textAlign: 'left',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {title}
          {badge && (
            <span style={{
              fontSize: '10px', fontWeight: 700, padding: '2px 8px',
              borderRadius: '20px', background: `${C.accent}22`, color: C.accent,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>{badge}</span>
          )}
        </div>
        <span style={{ color: C.muted, fontSize: '16px', lineHeight: 1 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '16px 18px 18px', background: C.bg, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: '13px', color: C.text, lineHeight: 1.75 }}>{children}</p>
}

function Note({ children, color }: { children: React.ReactNode; color?: string }) {
  const c = color || C.accent
  return (
    <div style={{
      background: `${c}11`, border: `1px solid ${c}33`,
      borderRadius: '6px', padding: '10px 14px',
      fontSize: '13px', color: C.text, lineHeight: 1.7,
    }}>
      {children}
    </div>
  )
}

function Term({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <span style={{
        fontWeight: 700, color: C.accent, fontSize: '12px',
        minWidth: '90px', paddingTop: '2px', flexShrink: 0,
      }}>{term}</span>
      <span style={{ fontSize: '13px', color: C.text, lineHeight: 1.65 }}>{children}</span>
    </div>
  )
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      borderLeft: `3px solid ${C.accent}44`, paddingLeft: '14px',
      display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      {children}
    </div>
  )
}

function Label({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontWeight: 700, color, fontSize: '11px',
      background: `${color}18`, padding: '1px 7px',
      borderRadius: '4px', marginRight: '6px',
    }}>{children}</span>
  )
}

export default function UserGuide({ isAdmin, userRole }: Props) {
  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', fontFamily: font }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 700, color: C.accent }}>
          Options Compass — User Guide
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: C.muted }}>
          Everything you need to read, analyse, and paper-trade options — educational simulator only.
          {isAdmin && ' Admin-specific sections are marked below.'}
        </p>
      </div>

      {/* ── GETTING STARTED ── */}
      <Section title="Getting Started" defaultOpen>
        <P>
          Options Compass is a <strong>paper-trading simulator for educational purposes only</strong>. It is not
          financial advice and does not involve real money. The app teaches you how to read options markets,
          understand strategy mechanics, and practise placing trades — all in a risk-free environment using
          established options education frameworks.
        </P>
        <Note>
          <strong>The golden rule:</strong> Every strategy you consider comes with a plain-English explanation
          covering market conditions, IV context, trade mechanics, profit/loss scenarios, and an execution
          checklist. Read the full narrative before placing any trade. The decision to trade is yours.
        </Note>
      </Section>

      {/* ── OPTIONS CHAIN ── */}
      <Section title="Options Chain">
        <P>
          The <strong>Options Chain</strong> tab shows all available calls and puts for the symbol entered in
          the search bar at the top. Select an expiry date from the dropdown to view that expiration's contracts.
        </P>
        <Sub>
          <P><Label color={C.green}>Calls</Label> Give the buyer the right to <strong>buy</strong> 100 shares at the strike price. Profitable when the stock rises.</P>
          <P><Label color={C.red}>Puts</Label> Give the buyer the right to <strong>sell</strong> 100 shares at the strike price. Profitable when the stock falls.</P>
          <P><Label color={C.accent}>Strike</Label> The price at which the option contract is exercised. Strikes are listed in the centre column.</P>
          <P><Label color={C.muted}>ITM / OTM</Label> In-the-money (ITM) options have intrinsic value; out-of-the-money (OTM) options are pure time value.</P>
        </Sub>
        <P>The Greeks columns explain how sensitive each contract is:</P>
        <Sub>
          <Term term="Delta (Δ)">How much the option price moves per $1 move in the stock. A 0.30 delta call gains ~$30 if the stock rises $1.</Term>
          <Term term="Gamma (Γ)">How fast delta changes. High gamma near expiry means the option becomes much more sensitive to price moves.</Term>
          <Term term="Theta (Θ)">Daily time decay — how much value the option loses each day just from time passing. Sellers collect theta; buyers pay it.</Term>
          <Term term="Vega (V)">Sensitivity to implied volatility changes. A vega of 0.10 means the option gains/loses $10 for every 1% change in IV.</Term>
        </Sub>
        <Note color={C.amber}>
          <strong>Tip:</strong> Click any row in the chain to pre-fill the Order Entry panel on the right with that contract's details. Adjust action (Buy/Sell) and quantity before submitting.
        </Note>
      </Section>

      {/* ── STRATEGY SCANNER ── */}
      <Section title="Strategy Scanner">
        <P>
          The <strong>Strategy Scanner</strong> tab scans a watchlist of symbols simultaneously and ranks them
          by IV Rank (IVR) — highest opportunity first. It tells you <em>what to look at</em> without you having
          to check each symbol manually.
        </P>
        <Sub>
          <Term term="IVR (IV Rank)">Where today's implied volatility sits relative to the past 52 weeks, on a 0–100 scale. IVR 80 means options are more expensive than 80% of all days in the past year. Higher = better for sellers. The coloured dot next to the IVR bar shows data reliability — <strong style={{color:'#38bdf8'}}>blue</strong> or <strong style={{color:'#34d399'}}>teal</strong> means primary real-time feed (most reliable); <strong style={{color:'#facc15'}}>yellow</strong> means approximated from the live options chain (secondary); <strong style={{color:'#9ca3af'}}>grey</strong> means estimated from historical volatility only (weakest). <strong>If the dot is not blue or teal, trade with caution — the IV rank may not reflect true market conditions.</strong></Term>
          <Term term="Current IV">The annualised implied volatility of the at-the-money option, expressed as a percentage.</Term>
          <Term term="IV Environment">HIGH (IVR &gt; 50), MEDIUM, or LOW — determines whether to favour selling or buying strategies.</Term>
          <Term term="Bias">The directional signal based on RSI and moving averages: BULLISH, BEARISH, NEUTRAL, NEUTRAL_BULLISH, or NEUTRAL_BEARISH.</Term>
          <Term term="IV-Fit Strategies">The count of strategies that suit the current IV environment only (HIGH / MEDIUM / LOW). This is a first-pass filter — it does not account for directional bias.</Term>
          <Term term="Condition Matches">The number of strategies where <em>both</em> IV environment and directional bias align. This is the only actionable number — <strong>do not deploy any strategy when matches = 0.</strong></Term>
        </Sub>
        <Note color='#b45309'>
          <strong>Two sequential gates — not one.</strong> The 31 strategies are spread across IV environments by design.
          Gate 1 (IV environment) already shrinks the pool significantly: HIGH IV → ~27 strategies, MEDIUM IV → ~6, LOW IV → ~10.
          You will never see all 31 in the IV-fit column because strategies designed for selling premium in high-IV markets are irrelevant when IV is low, and vice versa.
          Gate 2 (directional bias) then filters that smaller pool. For MEDIUM IV + NEUTRAL bias, only 6 strategies pass gate 1 and all 6 require a directional conviction — so gate 2 gives 0 matches.
          <strong>0 matches is a "wait" signal</strong> — the volatility is suitable but the market is giving no clear directional edge. Wait for the bias to resolve, or scan a symbol with a cleaner setup.
        </Note>
        <P>
          Click <strong>Analyze</strong> on any row to run a full deep-dive analysis on that symbol, including
          a side-by-side comparison of all applicable strategies, specific strike recommendations, a full plain-English narrative, and an execution checklist.
        </P>
        <Note>
          The scanner uses market data from Yahoo Finance, which is delayed by approximately 15 minutes. Results refresh each time you load the tab.
          Add your own watchlist by typing comma-separated symbols into the search box (e.g. <code>SPY,AAPL,TSLA</code>).
        </Note>
      </Section>

      {/* ── METHODOLOGY ── */}
      <Section title="Methodology — How Strategies Are Selected">
        <P>
          The <strong>Methodology</strong> tab (labelled <strong>How</strong> on mobile) explains the complete strategy selection engine:
          the IV environment formula, directional bias calculation, the two-gate filtering logic, and the 31-strategy catalog.
          Available to all authenticated users; no tier gate.
        </P>
        <Sub>
          <P><strong>Why this exists:</strong> Scan results show "8 strategies available" and "3 condition matches", but those numbers mean nothing without context. The Methodology page teaches you what they mean.</P>
          <P><strong>What it covers:</strong> IV Rank formula and thresholds (HIGH &gt; 50, MEDIUM 30–50, LOW &lt; 30). Directional bias from SMA20/50 crossover + RSI(14). The scoring rules: +2 for IV match, +3 for exact direction, +1 for partial match, −0.1×complexity. All 31 strategies grouped by direction, with IV environment, DTE, P&L family. Earnings awareness and options flow context.</P>
          <P><strong>How to access:</strong> Click the <strong>Methodology</strong> (or <strong>How</strong> on mobile) tab in the main tab bar. You can also click "Learn how strategies are selected →" in the Scanner tab header to jump straight there.</P>
        </Sub>
        <Note color={C.blue}>
          <strong>This is educational content:</strong> The methodology page does not run a scan or make any API calls. It is static, instant, and available offline (if your session is active).
        </Note>
      </Section>

      {/* ── DEEP ANALYSIS ── */}
      <Section title="Deep Analysis — Strategy Comparison Matrix and Narrative">
        <P>
          When you click <strong>Analyze</strong> on a symbol, the app displays a <strong>Strategy Comparison Matrix</strong> — a side-by-side table of all applicable strategies for the current IV environment. Below that is a multi-section plain-English narrative that explains the market context and trade mechanics. Here is what you see:
        </P>

        <div style={{ background: C.surface2, borderRadius: '8px', padding: '12px 14px', marginBottom: '10px' }}>
          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Strategy Comparison Matrix</div>
          <P>A sortable table showing all applicable strategies for this symbol and IV environment. Each row shows: strategy name, type (credit or debit), maximum profit, maximum loss, greeks (delta, theta, vega), probability of profit, and <strong>Condition Fit</strong> indicators. The Condition Fit column shows checkmarks (✓) or crosses (✗) for IV alignment and directional alignment — a factual, educational comparison of the current ticker's conditions against each strategy's textbook design. Click any row's Condition Fit cell to expand an explanation. The matrix is not ranked; all strategies remain visible by default. Use the filter controls to show only strategies where both conditions match, or filter by direction, type, or risk.</P>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
          <div style={{ background: C.surface2, borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Market Snapshot</div>
            <P>Price vs the 20-day and 50-day moving averages, RSI reading, MACD momentum, and daily ATR range. Also shows recent news headlines for the symbol and an earnings alert if earnings are within 30 days.</P>
          </div>
          <div style={{ background: C.surface2, borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, color: C.blue, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Why Options Are Priced This Way</div>
            <P>IV Rank in context, comparison of implied vs historical volatility (IV vs HV), IV term structure (contango / backwardation across expiry dates), and put skew — whether the market is paying a premium to protect against downside.</P>
          </div>
          <div style={{ background: C.surface2, borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, color: C.amber, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Why This Strategy</div>
            <P>Once you expand a strategy card from the matrix, this section explains the logic behind that strategy given the IV environment and directional bias. Also shows: earnings risk warning (if applicable), options flow put/call ratio and any unusual volume activity, and MACD alignment with the bias.</P>
          </div>
          <div style={{ background: C.surface2, borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, color: C.text, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>The Trade in Simple Terms</div>
            <P>Each leg of the trade broken down: which option to buy or sell, the strike, expiry, estimated cost or credit per contract, delta, and bid/ask. The legs table includes a <strong>Qty column</strong> that shows how many contracts to place at each strike. For strategies like ZEBRAs, butterflies, and front-ratio spreads that use multiple contracts of the same option at one strike, they appear as a single row with Qty greater than 1 (e.g., "BUY 2" at a single strike for Call ZEBRA). For strategies with unlimited upside (like ZEBRAs), exit guidance shows time-based targets ("close at 21 DTE") rather than a fixed profit target. Also shows the ATR (typical daily move) and a flag if earnings fall within the trade window.</P>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ background: '#0f2d1a', border: `1px solid ${C.green}33`, borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontWeight: 700, color: C.green, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Profit Scenario</div>
              <P>The conditions under which this trade wins at expiry, maximum profit, recommended early exit target, and probability of profit.</P>
            </div>
            <div style={{ background: '#2d0f0f', border: `1px solid ${C.red}33`, borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontWeight: 700, color: C.red, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Loss Scenario</div>
              <P>Maximum loss, when losses begin, and the standard 2× credit rule for undefined-risk trades.</P>
            </div>
          </div>
          <div style={{ background: '#2d1f0a', border: `1px solid ${C.amber}33`, borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, color: C.amber, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Defensive Tactic</div>
            <P>What to do if the trade moves against you — rolling, adjusting, or closing, specific to the strategy type.</P>
          </div>
          <div style={{ background: C.surface2, borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, color: C.muted, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Execution Checklist</div>
            <P>Step-by-step instructions for placing the trade in your broker, including limit price, GTC closing order, price alerts, and the 21-DTE close reminder. Click <strong>Copy Checklist</strong> to paste it into your notes.</P>
          </div>
        </div>

        <Note color={C.blue}>
          <strong>How to use the Condition Fit column:</strong> The checkmarks and crosses show whether the current ticker's IV environment and directional bias match each strategy's textbook design. This is educational context, not a ranking. You may choose a strategy with crosses if your analysis suggests a different thesis than the current bias. The decision is yours.
        </Note>
        <Note color={C.amber}>
          <strong>Why are some strategies not shown?</strong> The engine suppresses strategies that are non-viable at current market prices — for example, a debit spread where the cost to enter exceeds the maximum possible profit. Showing a trade with a negative or unfavourable risk/reward would be misleading. These strategies automatically reappear when IV or price conditions shift into a viable zone.
        </Note>
      </Section>

      {/* ── PLACING TRADES ── */}
      <Section title="Placing a Paper Trade">
        <P>
          Options Compass includes a paper trading system — trades are simulated with real market prices but no
          real money is at risk. Use it to practice strategy execution and track your P&amp;L.
        </P>
        <P>There are three ways to record a trade:</P>
        <Sub>
          <P><strong>From the Options Chain:</strong> click any row to pre-fill the Order Entry panel (right sidebar on desktop, bottom drawer on mobile).</P>
          <P><strong>From the Scanner:</strong> click <strong>Analyze</strong> on a symbol, review the AI narrative, then click <strong>Record Trade</strong> to log the recommended strategy legs in one step — strategy name, profit target, and narrative are saved automatically.</P>
          <P><strong>Manual entry (Positions tab):</strong> click <strong>+ Record Trade</strong> at the top of the Positions tab to open a quick-entry form. Fill in Symbol, Expiry, Strike, Type, Action, Qty, and Price, then click <strong>Record</strong>. Use this for trades you've already placed in your real broker and want to track here, or for any single-leg position not covered by the scanner flow.</P>
        </Sub>
        <P>Fields in the manual entry form:</P>
        <Sub>
          <Term term="Symbol">The ticker (e.g. SPY, AAPL, QQQ). Automatically uppercased.</Term>
          <Term term="Expiry">The expiration date in YYYY-MM-DD format.</Term>
          <Term term="Strike">The option strike price.</Term>
          <Term term="Type">Call or Put.</Term>
          <Term term="Action">Buy (you pay premium) or Sell (you collect premium).</Term>
          <Term term="Qty">Number of contracts. Each contract controls 100 shares. Defaults to 1.</Term>
          <Term term="Price">The fill price per share (e.g. 7.30 for a $730 total cost on 1 contract).</Term>
        </Sub>
        <Note color={C.green}>
          <strong>Always use limit orders in real trading</strong> — never market orders. The bid/ask spread on options
          can be wide, and a market order may fill at a price significantly worse than the mid-price shown.
        </Note>
      </Section>

      {/* ── PORTFOLIO ── */}
      <Section title="Positions & P&L">
        <P>
          The <strong>Positions</strong> tab shows your open paper trades, their current market value,
          unrealised P&amp;L, and Greeks. The P&amp;L chart below shows your equity curve over time.
        </P>
        <Sub>
          <Term term="Avg Cost">The price you paid (or collected) when entering the trade.</Term>
          <Term term="Current Price">The current mid-price of the option.</Term>
          <Term term="P&L">Unrealised profit or loss: (current price − avg cost) × quantity × 100.</Term>
          <Term term="Delta">The position's net directional exposure. A delta of +50 means you gain ~$50 if the stock rises $1.</Term>
        </Sub>
        <P>
          The <strong>Orders</strong> tab shows your full trade history with entry prices, quantities, and status.
        </P>
        <Note color={C.amber}>
          Positions are marked to market using the current mid-price each time you open the Positions tab.
          Click the tab to trigger a fresh snapshot.
        </Note>
      </Section>

      {/* ── GLOSSARY ── */}
      <Section title="Key Terms Glossary">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Term term="IV (Implied Vol)">The market's forecast of how much a stock will move, expressed as an annualised percentage. Derived from current option prices.</Term>
          <Term term="HV (Historical Vol)">How much the stock has actually moved over the past 30 days. Compare to IV to see if options are expensive or cheap.</Term>
          <Term term="IVR (IV Rank)">Where today's IV sits on a 0–100 scale relative to the past 52 weeks. Above 50 = high IV, sell premium. Below 30 = low IV, buy premium.</Term>
          <Term term="IV Crush">The sharp drop in implied volatility immediately after an earnings announcement or major event. Hurts options buyers; helps sellers.</Term>
          <Term term="Term Structure">The relationship between IV across different expiry dates. Contango = far months have higher IV than near months (normal). Backwardation = near months have higher IV (event-driven).</Term>
          <Term term="Put Skew">Out-of-the-money puts trading at higher IV than equivalent calls, reflecting the market's premium for downside protection.</Term>
          <Term term="PCR">Put/Call Ratio — ratio of put volume to call volume. Below 0.7 is bullish (call-heavy); above 1.3 is bearish (put-heavy).</Term>
          <Term term="ATR">Average True Range — the average daily high-to-low range over the past 14 days. Expressed as a dollar or percentage figure.</Term>
          <Term term="MACD">Moving Average Convergence Divergence — a momentum indicator. When the MACD line is above the signal line, momentum is bullish.</Term>
          <Term term="DTE">Days to Expiration. A common practice is to target 30–45 DTE for new entries and close at 21 DTE to avoid accelerated decay risk.</Term>
          <Term term="PoP">Probability of Profit — estimated chance the trade is profitable at expiration, derived from the delta of the short strikes.</Term>
          <Term term="Defined Risk">A trade where max loss is capped (e.g. vertical spreads, iron condors). You can never lose more than the spread width minus credit.</Term>
          <Term term="Undefined Risk">A trade with no hard loss ceiling (e.g. naked puts/calls, strangles). As a good practice, sizing these at 1–3% of portfolio is recommended.</Term>
          <Term term="2× Rule">A common stop-loss rule for undefined-risk trades: if the loss equals 2× the premium collected, close the position immediately.</Term>
          <Term term="Rolling">Closing a current position and reopening it at a later expiry (or different strikes) — ideally for a net credit to extend the trade's time horizon.</Term>
          <Term term="Back-Ratio (ZEBRA)">A 2:1 spread structure — 2 long contracts at one strike, 1 short at another. The net-long position above the short strike creates unlimited profit potential. Max loss is capped at the debit paid.</Term>
          <Term term="Qty Column">Shown in the legs table when a strategy requires more than one contract at the same strike (e.g., butterflies, ZEBRAs). A Qty of 2 means place 2 contracts at that strike, not 1.</Term>
        </div>
      </Section>

      {/* ── LEGAL TERMS ACKNOWLEDGMENT ── */}
      <Section title="Legal Terms Acknowledgment">
        <P>
          Before you can access the platform, you must read and agree to the <strong>Risk Disclosure &amp; Indemnification Agreement</strong>.
          This is a one-time requirement that protects both you and the platform.
        </P>
        <P>
          After you sign in, you will see a full-screen modal displaying the complete terms of service. You must scroll through
          the entire document until you reach the bottom. Once you have scrolled to the end, the acknowledgment checkbox will unlock,
          and you can check it and click <strong>I Agree &amp; Continue</strong> to proceed.
        </P>
        <Note color={C.amber}>
          <strong>Important:</strong> The terms cover critical disclaimers about paper trading, AI-generated content, market data accuracy,
          trading risks, and limitations of liability. Do not skip reading them — they explain what Options Compass is and is not.
        </Note>
        <Sub>
          <P><strong>What if the terms change?</strong> If the platform administrators publish updated terms, you will be prompted to acknowledge the new version before you can continue using the platform. You will need to scroll through and agree again.</P>
          <P><strong>Admin users</strong> can skip the legal gate and proceed directly to the platform; the gate is shown with an admin badge for transparency.</P>
        </Sub>
      </Section>

      {/* ── SIGNING IN ── */}
      <Section title="Signing In">
        <P>
          Options Compass uses two secure sign-in methods: <strong>Google OAuth</strong> and <strong>email/password</strong>.
        </P>
        <Sub>
          <P><strong>Google sign-in:</strong> Click "Sign in with Google" on the login page. You will be redirected to Google's login (or skip this step if you are already logged in to Google). Approve the permission prompt, and you will be returned to OptionDesk. Session established — no password to remember.</P>
          <P><strong>Email/password sign-in:</strong> Toggle to "Email & Password" on the login page. Enter your email and password. If you do not have an account yet, click "Create an account" instead. Session established — you can use any password you choose.</P>
        </Sub>
        <Note color={C.blue}>
          <strong>Sessions persist automatically:</strong> After you sign in, your session remains active for up to 1 hour without any action on your part. If you close the browser and reopen the app within 7 days, your session restores automatically — you will not need to sign in again. After 7 days of inactivity, or if you explicitly sign out, you will need to sign in again.
        </Note>
        <P>
          <strong>Sign out:</strong> From the dashboard, click your account icon in the top-right corner and select "Sign out". Your session is immediately cleared, and the login screen is displayed.
        </P>
      </Section>

      {/* ── SIGN UP & PLAN SELECTION ── */}
      <Section title="Sign-Up and Plan Selection">
        <P>
          New visitors can sign up for free without a payment method. You can sign in with <strong>Google</strong> or
          create an account with your email and password.
        </P>
        <P>
          <strong>Free tier (no card required):</strong> Sign up and go directly to the dashboard. You get access to
          the Strategy Scanner (10 scans per month) and Options Chain. You can add up to 5 symbols to your watchlist.
          Paper trading is included.
        </P>
        <P>
          <strong>Paid tiers (Starter, Pro, Enterprise):</strong> Select your plan on the pricing page. You will be
          redirected to a secure payment form (Stripe) to enter your card details. After your payment is processed,
          you immediately unlock the features included in your tier. Your first billing cycle starts on the day you
          subscribe; your renewal date is shown in Settings.
        </P>
        <Note color={C.green}>
          Each plan unlocks different features. The free tier is designed to let you explore the platform risk-free.
          Upgrade anytime from the Settings page without losing your watchlist or paper trading history.
        </Note>
      </Section>

      {/* ── SUBSCRIPTION & BILLING SETTINGS ── */}
      <Section title="Settings Page — Account, Subscription, and Billing">
        <P>
          The <strong>Settings</strong> page is your control center for account management and billing. Access it from
          the dashboard menu.
        </P>

        <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 6px' }}>Account Tab</div>
        <Sub>
          <P><strong>Display Name</strong> — your public profile name. Update it anytime.</P>
          <P><strong>Email</strong> — shown for reference. If you signed up with Google, email is tied to your Google account and cannot be changed here.</P>
          <P><strong>Password</strong> — visible only if you created an email/password account. Change it anytime for security.</P>
          <P><strong>Avatar</strong> — your profile picture. Currently pulled from Google if you signed in with Google.</P>
        </Sub>

        <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 6px' }}>Subscription Tab</div>
        <Sub>
          <P><strong>Current Plan</strong> — displays your active tier (Free, Starter, Pro, or Enterprise).</P>
          <P><strong>Billing Cycle</strong> — shows your next renewal date. Your cycle renews on this date each month.</P>
          <P><strong>Upgrade</strong> — instantly move to a higher tier. Charges are prorated; you pay only for the remainder of your current billing period at the new tier's rate.</P>
          <P><strong>Downgrade</strong> — schedule a move to a lower tier. Takes effect at the end of your current billing period; you retain full access until then.</P>
          <P><strong>Scheduled Changes</strong> — if a downgrade is scheduled, a banner shows the effective date.</P>
        </Sub>

        <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 6px' }}>Billing Tab</div>
        <Sub>
          <P><strong>Payment Method</strong> — displays the last four digits, card brand (Visa, Mastercard, etc.), and expiry month/year. No full card number is stored with Options Compass.</P>
          <P><strong>Update Card</strong> — click to securely update your payment method via Stripe. You are redirected to Stripe's secure portal and return automatically.</P>
          <P><strong>Invoice List</strong> — shows all invoices tied to your account, including date, amount, and status (paid, open, void). Click the PDF link to download the invoice from Stripe.</P>
        </Sub>

        <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 6px' }}>Danger Zone</div>
        <Sub>
          <P><strong>Cancel Subscription</strong> — schedules your subscription to cancel at the end of your current billing period. You retain full access until that date. A confirmation step requires you to type "CANCEL" to prevent accidental cancellation.</P>
          <P><strong>Delete Account</strong> — permanently removes your account, all positions, orders, and P&amp;L history. This cannot be undone. Requires a deliberate confirmation.</P>
        </Sub>

        <Note color={C.amber}>
          <strong>Payment Failed?</strong> If your card is declined, a banner appears on login with a direct link to update your payment method. Your access is downgraded to free tier while payment is overdue. Update your card to restore full access within seconds.
        </Note>
      </Section>

      {/* ── TIER-GATED FEATURES ── */}
      <Section title="Tier-Gated Features — What You Unlock">
        <P>
          Each subscription tier unlocks different features. Tabs that your tier does not include show a locked
          placeholder with the minimum tier required and an "Upgrade" button.
        </P>

        <div style={{ background: C.surface2, borderRadius: '8px', padding: '12px 14px', marginTop: '8px', marginBottom: '8px' }}>
          <div style={{ fontWeight: 700, color: C.accent, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Free Tier</div>
          <P><Label color={C.green}>Included:</Label> Strategy Scanner (10 scans/month, max 5 watchlist symbols), Options Chain.</P>
          <P><Label color={C.red}>Locked:</Label> Trading Desk (requires Starter+), Positions & P&amp;L (requires Starter+), Risk Monitor (requires Pro+).</P>
        </div>

        <div style={{ background: C.surface2, borderRadius: '8px', padding: '12px 14px', marginBottom: '8px' }}>
          <div style={{ fontWeight: 700, color: C.blue, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Starter ($9/mo)</div>
          <P><Label color={C.green}>Included:</Label> Everything in Free tier + Strategy Scanner (100 scans/month, max 15 watchlist symbols) + Positions & P&amp;L tab.</P>
          <P><Label color={C.red}>Locked:</Label> Trading Desk (requires Pro+), Risk Monitor (requires Pro+).</P>
        </div>

        <div style={{ background: C.surface2, borderRadius: '8px', padding: '12px 14px', marginBottom: '8px' }}>
          <div style={{ fontWeight: 700, color: C.amber, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Pro ($29/mo)</div>
          <P><Label color={C.green}>Included:</Label> Everything in Starter tier + Strategy Scanner (unlimited scans, max 50 watchlist symbols) + Trading Desk tab (Reddit buzz feeds, options flow, earnings alerts).</P>
          <P><Label color={C.red}>Locked:</Label> Risk Monitor (requires Enterprise).</P>
        </div>

        <div style={{ background: C.surface2, borderRadius: '8px', padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Enterprise ($99+/mo)</div>
          <P><Label color={C.green}>Included:</Label> Unlimited everything — unlimited scans, unlimited watchlist symbols, all tabs unlocked including Risk Monitor.</P>
        </div>

        <Note color={C.blue}>
          <strong>Watchlist limits:</strong> Each tier has a maximum number of symbols you can add to your watchlist. If you downgrade and exceed your new tier's limit, your list is not automatically trimmed, but you cannot add new symbols until you remove excess ones.
        </Note>
      </Section>

      {/* ── AI FEATURES ── */}
      <Section title="AI Features — What They Do & What They Need">
        <P>
          The <strong>AI Features</strong> tab provides eleven AI-powered tools that analyse your watchlist,
          portfolio, and trades using Claude (Anthropic's AI). All AI features require an active
          <strong> Anthropic API key</strong> to be configured by the platform administrator — without it,
          the features are available in the UI but AI generation will show a fallback message.
        </P>

        <Note color={C.amber}>
          <strong>No Anthropic API key?</strong> The Strategy Scanner, Options Chain, narrative analysis,
          paper trading, and all core features work fully without it. Only the AI tab features listed below
          require the key.
        </Note>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          <div style={{ background: C.surface2, borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, color: C.accent, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>All 11 AI Features (Pro/Enterprise)</div>
            <Sub>
              <Term term="1. Morning Briefing">A daily &lt;120-word market summary covering your watchlist symbols — IV regime, earnings risk, and strategy suggestions. Auto-regenerates when you update your watchlist.</Term>
              <Term term="2. AI Chat">Ask plain-English questions about your portfolio. Example: "Which of my positions has the most theta risk?" Replies in context of your open trades.</Term>
              <Term term="3. AI Risk Summary">Synthesises your position risk signals into a single paragraph — flags concentration risk, DTE urgency, and positions breaching loss rules.</Term>
              <Term term="4. AI Strategy Reasoning">After running a deep analysis on a symbol, this explains in plain English why a specific strategy was ranked the way it was, given the current IV and bias.</Term>
              <Term term="5. AI Narrative Enhancement">Enriches the standard plain-English narrative with additional market context, flow interpretation, and macro backdrop — beyond what the rule-based narrative covers.</Term>
              <Term term="6. Earnings Awareness">Surfaces earnings dates for watchlist symbols and explains how an upcoming announcement affects the strategy selection and position sizing.</Term>
              <Term term="7. Trade Journal Review">After closing a trade, submit it for an AI post-mortem: entry consistency, rule adherence, and behavioural patterns graded A–D.</Term>
              <Term term="8. Roll Advisor">When a position approaches 21 DTE or a loss threshold, the Roll Advisor suggests whether to roll, close, or adjust — with specific strike and expiry recommendations.</Term>
              <Term term="9. Greeks Coaching">Explains what your current portfolio-level Greeks (delta, theta, vega) mean in plain English and suggests rebalancing actions if any exposure is outsized.</Term>
              <Term term="10. News Sentiment">Analyses recent headlines for your watchlist symbols and summarises the sentiment impact on each ticker's options pricing.</Term>
              <Term term="11. AI Strategy Comparison">After scanning a symbol, compares two or more strategies side-by-side with an AI-written explanation of the trade-offs in the current market environment.</Term>
            </Sub>
          </div>
        </div>

        <Note>
          AI features are enabled per-account in the <strong>AI Features</strong> tab. Each feature has an
          individual toggle — you can enable only the ones you want. All AI calls are made server-side;
          your data is never sent directly to Anthropic from your browser.
        </Note>
      </Section>

      {/* ── FAQ ── */}
      <Section title="FAQ & Knowledge Base">
        <P>
          Visit the <strong>FAQ page</strong> (link in the footer) for answers to common questions about using Options Compass,
          subscribing, managing your account, and trading on the platform. The FAQ is maintained by our support team and
          updated regularly.
        </P>
        <Note>
          Did not find the answer you were looking for? Check back soon — the FAQ grows as we receive feedback.
        </Note>
      </Section>

      {/* ── ADMIN TOOLS ── */}
      {isAdmin && (
        <Section title="Admin Tools" badge="Admin">
          <P>
            As a platform administrator, you have access to two additional tabs in the Admin panel:
          </P>
          <Sub>
            <P><strong>Health Monitor</strong> — Real-time status of all platform components (Backend API, Supabase Database, yfinance Market Data, Gemini AI, StockTwits). Shows component status, response time, and any errors. Includes a 60-second auto-refresh and a manual Refresh button. Use this to diagnose which subsystem is degraded when users report failures.</P>
            <P><strong>User Actions</strong> — Granular audit log of all user events (login, logout, ticker search, strategy scan, options chain view, paper trade, watchlist update, AI query). Filter by user email, action type, or date range. Paginated display of 50 rows per page. Use this to understand user behaviour, investigate support requests, and verify feature adoption.</P>
          </Sub>
          <Note>
            The existing <strong>Activity Log (Logins)</strong> tab continues to show daily login aggregates and is unchanged.
          </Note>
        </Section>
      )}

      {/* ── ADMIN PORTAL (OWNER, SUPPORT, FINANCE) ── */}
      {userRole === 'owner' && (
        <Section title="Admin Portal — Owner Guide" badge="Owner Only">
          <P>
            As an Owner, you have full access to the admin portal at <code>admin.<em>optionsdeskpro.com</em></code>.
            You can manage subscribers, staff, pricing, revenue, and platform-wide settings.
          </P>

          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 6px' }}>Subscribers Tab</div>
          <Sub>
            <P>View all subscribers with their email, tier, subscription status, and last login. Search by email or name. Click a subscriber to view their full profile, billing history, paper trading activity, and support options.</P>
            <P><strong>Tier Override:</strong> temporarily grant a subscriber a different tier for testing or special circumstances (e.g. trial period). The override takes precedence over their Stripe tier.</P>
            <P><strong>Deactivate Account:</strong> suspend a subscriber's login access. They receive an error message on next sign-in directing them to contact support. Their data is retained.</P>
            <P><strong>Support View:</strong> enter a read-only view of their dashboard (same data, fully watermarked). Use this to diagnose issues without asking for screenshots.</P>
          </Sub>

          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 6px' }}>Pricing Tab</div>
          <Sub>
            <P>View all subscription tiers and their current prices. Edit prices and feature entitlements (watchlist limit, scan limit, which tabs are unlocked). Changes apply to new subscriptions and renewals immediately; existing subscribers are grandfathered at their current price.</P>
            <P>Confirmation shows how many active subscribers will be affected on their next renewal.</P>
          </Sub>

          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 6px' }}>Revenue Tab</div>
          <Sub>
            <P>Monitor Monthly Recurring Revenue (MRR), 12-month trend, active subscriber counts by tier, churn, and past-due accounts. Export invoice data as CSV for accounting and analysis.</P>
          </Sub>

          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 6px' }}>Health Panel</div>
          <Sub>
            <P>System health at a glance: API status, market data source, request counts, and active sessions.</P>
          </Sub>

          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 6px' }}>FAQ Management</div>
          <Sub>
            <P>Create, edit, and publish FAQ articles. Draft articles are visible only to you and Support staff. Publish to make them visible on the public FAQ page.</P>
          </Sub>

          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 6px' }}>Staff Management</div>
          <Sub>
            <P>Invite new platform staff (Owner, Support, Finance roles) by email. View all staff, change roles, and deactivate accounts. The system ensures at least one Owner is always active.</P>
          </Sub>

          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 6px' }}>Legal Management</div>
          <Sub>
            <P>Create and publish versioned legal documents (Terms of Service, Risk Disclosure agreements, etc.). Each published version becomes immediately active and requires all subscribers to acknowledge before accessing the platform. View publication history and acknowledgment counts per version.</P>
            <P><strong>Publishing a new version:</strong> Write or paste your legal document, set the effective date, and click Publish. The system automatically deactivates the previous version. All subscribers will be prompted to acknowledge the new version on next login.</P>
          </Sub>

          <Note color={C.amber}>
            <strong>Role assignment:</strong> Owners see all tabs and features. Support staff cannot see revenue or edit pricing, and cannot publish legal documents. Finance staff can only view revenue and export reports. All actions are audit-logged.
          </Note>
        </Section>
      )}

      {userRole === 'support' && (
        <Section title="Admin Portal — Support Staff Guide" badge="Support">
          <P>
            As Support staff, you have access to the admin portal at <code>admin.<em>optionsdeskpro.com</em></code>.
            You can assist subscribers, manage the FAQ, and view subscriber profiles.
          </P>

          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 6px' }}>Subscribers Tab</div>
          <Sub>
            <P>Search for and view subscriber profiles. You can see their account details, subscription status, billing history, and paper trading activity.</P>
            <P><strong>Support View:</strong> enter a read-only, fully watermarked view of their dashboard to diagnose issues. You cannot place orders, modify settings, or make any changes.</P>
          </Sub>

          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 6px' }}>FAQ Management</div>
          <Sub>
            <P>Create, edit, and publish FAQ articles. Publish entries to make them visible on the public FAQ page. Drafts are private.</P>
          </Sub>

          <Note color={C.blue}>
            You cannot edit pricing, view revenue, or manage staff accounts. Contact an Owner if you need assistance with those areas.
          </Note>
        </Section>
      )}

      {userRole === 'finance' && (
        <Section title="Admin Portal — Finance Staff Guide" badge="Finance">
          <P>
            As Finance staff, you have read-only access to billing and revenue data in the admin portal at
            <code>admin.<em>optionsdeskpro.com</em></code>.
          </P>

          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 6px' }}>Pricing Tab (Read-Only)</div>
          <Sub>
            <P>View all subscription tiers and their current prices. You cannot edit prices or entitlements.</P>
          </Sub>

          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 6px' }}>Revenue Tab</div>
          <Sub>
            <P>Monitor MRR, subscriber counts, churn, and past-due amounts. Export invoice data as CSV for accounting and analysis. This is your primary tool for financial reporting.</P>
          </Sub>

          <Note color={C.blue}>
            You cannot view subscriber profiles, edit FAQ, manage staff, or view the health panel. Contact an Owner for access to those areas.
          </Note>
        </Section>
      )}

      <div style={{ marginTop: '8px', padding: '12px 16px', background: C.surface, borderRadius: '8px', fontSize: '12px', color: C.muted, textAlign: 'center' }}>
        Options Compass · Paper-trading simulator · For educational purposes only · Not financial advice
      </div>
    </div>
  )
}
