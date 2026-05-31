import { useState } from 'react'

interface Props {
  isAdmin: boolean
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

export default function UserGuide({ isAdmin }: Props) {
  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', fontFamily: font }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 700, color: C.accent }}>
          OptionsDesk — User Guide
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: C.muted }}>
          Everything you need to read, analyse, and trade options using the tastylive framework.
          {isAdmin && ' Admin-specific sections are marked below.'}
        </p>
      </div>

      {/* ── GETTING STARTED ── */}
      <Section title="Getting Started" defaultOpen>
        <P>
          OptionsDesk is an options trading platform built around the <strong>tastylive</strong> methodology — a
          systematic approach to selling options premium when implied volatility is elevated, and buying when
          it is cheap. The app helps you identify opportunities, understand the reasoning behind each strategy,
          and execute trades with a clear plan.
        </P>
        <P>
          You sign in with your Google account. If you see an "Access denied" message, your email hasn't been
          added to the system — contact the admin to request access.
        </P>
        <Note>
          <strong>The golden rule:</strong> Every strategy recommendation on this app comes with a plain-English
          explanation covering market conditions, IV context, trade mechanics, profit/loss scenarios, and an
          execution checklist. Read it before placing any trade.
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
          <Term term="IVR (IV Rank)">Where today's implied volatility sits relative to the past 52 weeks, on a 0–100 scale. IVR 80 means options are more expensive than 80% of all days in the past year. Higher = better for sellers.</Term>
          <Term term="Current IV">The annualised implied volatility of the at-the-money option, expressed as a percentage.</Term>
          <Term term="IV Environment">HIGH (IVR &gt; 50), MEDIUM, or LOW — determines whether to favour selling or buying strategies.</Term>
          <Term term="Bias">The directional signal based on RSI and moving averages: BULLISH, BEARISH, NEUTRAL, NEUTRAL_BULLISH, or NEUTRAL_BEARISH.</Term>
          <Term term="Top Strategy">The single best-fit strategy recommended for that symbol given its IV environment and bias.</Term>
        </Sub>
        <P>
          Click <strong>Analyze</strong> on any row to run a full deep-dive analysis on that symbol, including
          specific strike recommendations, a full plain-English narrative, and an execution checklist.
        </P>
        <Note>
          The scanner uses real-time data from Yahoo Finance. Results refresh each time you load the tab.
          Add your own watchlist by typing comma-separated symbols into the search box (e.g. <code>SPY,AAPL,TSLA</code>).
        </Note>
      </Section>

      {/* ── DEEP ANALYSIS ── */}
      <Section title="Deep Analysis — Reading the Narrative">
        <P>
          When you click <strong>Analyze</strong> on a symbol, the app builds a full trade recommendation
          with a multi-section plain-English breakdown. Here is what each section means:
        </P>

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
            <P>Explains the logic behind the recommended strategy given the IV environment and directional bias. Also shows: earnings risk warning (if applicable), options flow put/call ratio and any unusual volume activity, and MACD alignment with the bias.</P>
          </div>
          <div style={{ background: C.surface2, borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, color: C.text, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>The Trade in Simple Terms</div>
            <P>Each leg of the trade broken down: which option to buy or sell, the strike, expiry, estimated cost or credit per leg, delta, and bid/ask. Also shows the ATR (typical daily move) and a flag if earnings fall within the trade window.</P>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ background: '#0f2d1a', border: `1px solid ${C.green}33`, borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontWeight: 700, color: C.green, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Profit Scenario</div>
              <P>The conditions under which this trade wins at expiry, maximum profit, recommended early exit target, and probability of profit.</P>
            </div>
            <div style={{ background: '#2d0f0f', border: `1px solid ${C.red}33`, borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontWeight: 700, color: C.red, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Loss Scenario</div>
              <P>Maximum loss, when losses begin, and the tastylive 2× credit rule for undefined-risk trades.</P>
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
      </Section>

      {/* ── PLACING TRADES ── */}
      <Section title="Placing a Paper Trade">
        <P>
          OptionsDesk includes a paper trading system — trades are simulated with real market prices but no
          real money is at risk. Use it to practice strategy execution and track your P&amp;L.
        </P>
        <Sub>
          <P><strong>From the Options Chain:</strong> click any row to pre-fill the Order Entry panel (right sidebar on desktop, bottom drawer on mobile).</P>
          <P><strong>From the Scanner:</strong> click <strong>Analyze</strong> on a symbol, then use the contract details from the narrative to fill in the Order Entry panel manually.</P>
        </Sub>
        <P>In the Order Entry panel:</P>
        <Sub>
          <Term term="Symbol">The ticker (e.g. SPY, AAPL).</Term>
          <Term term="Expiry">The expiration date. Use the date recommended in the narrative.</Term>
          <Term term="Strike">The option strike price.</Term>
          <Term term="Type">Call or Put.</Term>
          <Term term="Action">Buy (you pay premium) or Sell (you collect premium).</Term>
          <Term term="Quantity">Number of contracts. Each contract controls 100 shares.</Term>
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
          <Term term="DTE">Days to Expiration. tastylive targets 45 DTE for new entries and recommends closing at 21 DTE.</Term>
          <Term term="PoP">Probability of Profit — estimated chance the trade is profitable at expiration, derived from the delta of the short strikes.</Term>
          <Term term="Defined Risk">A trade where max loss is capped (e.g. vertical spreads, iron condors). You can never lose more than the spread width minus credit.</Term>
          <Term term="Undefined Risk">A trade with no hard loss ceiling (e.g. naked puts/calls, strangles). tastylive recommends sizing these at 1–3% of portfolio.</Term>
          <Term term="2× Rule">tastylive's stop-loss rule for undefined-risk trades: if the loss equals 2× the premium collected, close the position immediately.</Term>
          <Term term="Rolling">Closing a current position and reopening it at a later expiry (or different strikes) — ideally for a net credit to extend the trade's time horizon.</Term>
        </div>
      </Section>

      {/* ── ADMIN SECTION ── */}
      {isAdmin && (
        <Section title="Admin Panel" badge="Admin Only">
          <P>
            The <strong>Admin</strong> tab is visible only to users with the admin role.
            It provides tools for managing who can access the app and monitoring user activity.
          </P>

          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '4px 0 2px' }}>Users Tab</div>
          <Sub>
            <P>Shows every user who has <strong>logged in at least once</strong>. Columns include: name, email, role, cash balance, last login time, today's login count, and active/inactive status.</P>
            <P><strong>Add New User:</strong> enter a <code>@gmail.com</code> address (only Google accounts are supported), select the role (User or Admin), and click <strong>+ Add User</strong>. The user will be able to sign in immediately.</P>
            <P><strong>Change Role:</strong> use the role dropdown on any user row to promote them to Admin or demote them to User. The change takes effect on their next API call.</P>
            <P><strong>Deactivate:</strong> disables a user's access. They will receive "Access denied" on next sign-in.</P>
          </Sub>

          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 2px' }}>Whitelist Tab</div>
          <Sub>
            <P>Shows everyone who is <strong>allowed to sign in</strong>, including people who have been invited but haven't logged in yet. Use this to see pending invites or to remove access from someone who hasn't logged in.</P>
            <P>The Users tab's "Add New User" form writes to both this table and the user profile, so you rarely need to use the Whitelist tab directly.</P>
          </Sub>

          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 2px' }}>Activity Log Tab</div>
          <Sub>
            <P>Shows today's login activity — who signed in, how many times, when, and from which IP address. Auto-refreshes every 60 seconds.</P>
          </Sub>

          <div style={{ fontWeight: 700, color: C.accent, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 2px' }}>Leaderboard Tab</div>
          <Sub>
            <P>Ranks all users by total paper-trading P&amp;L using their latest portfolio snapshot. Updates automatically as users trade.</P>
          </Sub>

          <Note color={C.amber}>
            <strong>Role hierarchy:</strong> Admin users have full access to the Admin Panel and can manage other users.
            Promoting a user to Admin takes effect immediately — they do not need to log out and back in.
          </Note>
        </Section>
      )}

      <div style={{ marginTop: '8px', padding: '12px 16px', background: C.surface, borderRadius: '8px', fontSize: '12px', color: C.muted, textAlign: 'center' }}>
        OptionsDesk · Built on the tastylive framework · Paper trading only · Not financial advice
      </div>
    </div>
  )
}
