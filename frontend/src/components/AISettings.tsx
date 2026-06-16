import React, { useEffect, useRef, useState } from 'react'
import { getAISettings, updateAISettings, aiChat, AISettings as AISettingsType } from '../api/client'
import { useEntitlements } from '../context/EntitlementsContext'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  surface2: '#20243a',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
  green: '#22c55e',
  red: '#ef4444',
  purple: '#a78bfa',
}

const FEATURES: {
  key: keyof AISettingsType
  entitlementKey: string
  label: string
  description: string
  badge?: string
}[] = [
  {
    key: 'narrative_enabled',
    entitlementKey: 'ai_narrative',
    label: 'AI Narrative Enhancement',
    description: 'Adds a Claude-written coaching paragraph to each strategy setup — explains the specific IV/bias edge, exact numbers, and what has to go wrong for the trade to lose.',
  },
  {
    key: 'chat_enabled',
    entitlementKey: 'ai_chat',
    label: 'Portfolio Chat',
    description: 'Ask plain-English questions about your open positions. Claude answers using your real portfolio data — P&L, strikes, expiry, and strategy context.',
    badge: 'Chat',
  },
  {
    key: 'risk_summary_enabled',
    entitlementKey: 'ai_risk_summary',
    label: 'AI Risk Summary',
    description: 'One-paragraph portfolio health overview from Claude — most urgent action needed, things to watch, and a concrete recommendation. Appears in the Risk Monitor.',
  },
  {
    key: 'strategy_reasoning_enabled',
    entitlementKey: 'ai_strategy_reasoning',
    label: 'Strategy Reasoning',
    description: 'Explains in 3–4 sentences why the top-ranked strategy is the best fit right now — the specific IV+bias combination, one concrete edge, and what has to go wrong.',
  },
  {
    key: 'earnings_awareness_enabled',
    entitlementKey: 'ai_earnings_awareness',
    label: 'Earnings Awareness',
    description: 'Adjusts recommended expiry cycles around upcoming earnings. Premium sellers are routed to pre-earnings expiries; buyers to post-earnings. The narrative explains the adjustment.',
    badge: 'Smart',
  },
]

// Plan-included features (always active when plan supports them — no individual toggle)
const PLAN_FEATURES: {
  entitlementKey: string
  label: string
  description: string
  comingSoon?: boolean
}[] = [
  {
    entitlementKey: 'morning_briefing',
    label: 'Morning Briefing',
    description: 'Daily <120-word market summary covering your watchlist — IV regime, earnings risk, and strategy suggestions. Auto-regenerates when you update your watchlist. Visible in the Strategy Scanner tab.',
  },
  {
    entitlementKey: 'trade_journal',
    label: 'Trade Journal AI Review',
    description: 'After closing a trade, submit it for a post-mortem: entry consistency, rule adherence, and behavioural patterns graded A–D. Triggered per-trade from the Orders tab.',
  },
  {
    entitlementKey: 'roll_advisor',
    label: 'Roll Advisor',
    description: 'When a position approaches 21 DTE or a loss threshold, suggests whether to roll, close, or adjust — with specific strike and expiry recommendations. Visible in the Risk Monitor.',
  },
  {
    entitlementKey: 'greeks_coaching',
    label: 'Greeks Coaching',
    description: 'Explains what your current portfolio-level Greeks mean in plain English and suggests rebalancing actions if any exposure is outsized. Visible in the Positions tab.',
  },
  {
    entitlementKey: 'news_sentiment',
    label: 'News Sentiment Analysis',
    description: 'Analyses recent headlines for your watchlist symbols and summarises the sentiment impact on each ticker\'s options pricing.',
    comingSoon: true,
  },
  {
    entitlementKey: 'ai_strategy_comparison',
    label: 'AI Strategy Comparison',
    description: 'Compares two or more strategies side-by-side with an AI-written explanation of the trade-offs given the current IV environment and directional bias.',
    comingSoon: true,
  },
]

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => { if (!disabled) onChange(!on) }}
      disabled={disabled}
      style={{
        width: '44px', height: '24px', borderRadius: '12px', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: disabled ? '#2a2d3e' : on ? C.accent : '#3a3f5c',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: '3px', left: on ? '23px' : '3px', width: '18px', height: '18px',
        borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
      }} />
    </button>
  )
}

function ChatPanel() {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([])
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const q = question.trim()
    if (!q || loading) return
    setQuestion('')
    setMessages(m => [...m, { role: 'user', text: q }])
    setLoading(true)
    try {
      const res = await aiChat(q)
      setMessages(m => [...m, { role: 'ai', text: res.answer }])
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Could not reach the AI — please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div style={{ marginTop: '16px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontSize: '12px', color: C.muted, fontWeight: 600, letterSpacing: '0.05em' }}>
        PORTFOLIO CHAT
      </div>
      <div style={{ minHeight: '120px', maxHeight: '280px', overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages.length === 0 && (
          <p style={{ margin: 0, fontSize: '13px', color: C.muted, fontStyle: 'italic' }}>
            Ask anything about your portfolio — e.g. "Which position has the most risk?" or "What's my total P&L this month?"
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', lineHeight: 1.55,
              background: m.role === 'user' ? C.accent : C.surface2,
              color: m.role === 'user' ? '#fff' : C.text,
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ background: C.surface2, borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: C.muted }}>
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '8px' }}>
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about your positions…"
          style={{ flex: 1, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '6px', color: C.text, padding: '7px 10px', fontSize: '13px', outline: 'none' }}
        />
        <button
          onClick={send}
          disabled={loading || !question.trim()}
          style={{ background: C.accent, border: 'none', borderRadius: '6px', color: '#fff', padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: loading || !question.trim() ? 'not-allowed' : 'pointer', opacity: loading || !question.trim() ? 0.5 : 1 }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

export default function AISettings() {
  const { entitlements } = useEntitlements()
  const [settings, setSettings] = useState<AISettingsType>({
    narrative_enabled: false,
    chat_enabled: false,
    risk_summary_enabled: false,
    strategy_reasoning_enabled: false,
    earnings_awareness_enabled: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<keyof AISettingsType | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isFeatureUnlocked = (entitlementKey: string): boolean => {
    if (!entitlements) return false
    return (entitlements.features as unknown as Record<string, boolean | undefined>)[entitlementKey] ?? false
  }

  useEffect(() => {
    getAISettings()
      .then(setSettings)
      .catch(() => setError('Could not load AI settings.'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = async (key: keyof AISettingsType) => {
    const prev = settings
    const updated = { ...settings, [key]: !settings[key] }
    setSettings(updated)
    setSaving(key)
    try {
      await updateAISettings(updated)
    } catch {
      setSettings(prev)
      setError('Failed to save — please try again.')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 0', textAlign: 'center', color: C.muted, fontSize: '14px' }}>
        Loading AI settings…
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 0' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 700, color: C.text }}>AI Features</h2>
        <p style={{ margin: 0, fontSize: '14px', color: C.muted, lineHeight: 1.6 }}>
          Toggle Claude-powered features on or off. Each feature uses the Anthropic API — costs are minimal for normal usage.
        </p>
      </div>

      {error && (
        <div style={{ background: '#2d1515', border: `1px solid ${C.red}`, borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: C.red }}>
          {error}
        </div>
      )}

      {/* Toggleable features (1–5) */}
      <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
        User-Configurable
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
        {FEATURES.map(f => {
          const unlocked = isFeatureUnlocked(f.entitlementKey)
          return (
            <div
              key={f.key}
              style={{
                background: C.surface,
                border: `1px solid ${!unlocked ? C.border : settings[f.key] ? C.accent : C.border}`,
                borderRadius: '10px',
                padding: '16px 20px',
                transition: 'border-color 0.2s',
                opacity: unlocked ? 1 : 0.5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: C.text }}>{f.label}</span>
                    {f.badge && (
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: C.accent + '33', color: C.purple, letterSpacing: '0.05em' }}>
                        {f.badge}
                      </span>
                    )}
                    {!unlocked && (
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#7c6af722', color: C.purple, letterSpacing: '0.05em', border: `1px solid ${C.purple}44` }}>
                        Requires Pro
                      </span>
                    )}
                    {saving === f.key && (
                      <span style={{ fontSize: '11px', color: C.muted }}>saving…</span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: C.muted, lineHeight: 1.55 }}>{f.description}</p>
                </div>
                <Toggle on={settings[f.key]} onChange={() => toggle(f.key)} disabled={!unlocked} />
              </div>

              {f.key === 'chat_enabled' && settings.chat_enabled && unlocked && <ChatPanel />}
            </div>
          )
        })}
      </div>

      {/* Plan-included features (6–11) */}
      <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
        Always-On When Plan Supports
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {PLAN_FEATURES.map(f => {
          const unlocked = isFeatureUnlocked(f.entitlementKey)
          return (
            <div
              key={f.entitlementKey}
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: '10px',
                padding: '16px 20px',
                opacity: unlocked ? 1 : 0.5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: C.text }}>{f.label}</span>
                    {f.comingSoon && (
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#f59e0b22', color: '#f59e0b', letterSpacing: '0.05em', border: '1px solid #f59e0b44' }}>
                        Coming Soon
                      </span>
                    )}
                    {!unlocked && !f.comingSoon && (
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#7c6af722', color: C.purple, letterSpacing: '0.05em', border: `1px solid ${C.purple}44` }}>
                        Requires Pro
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: C.muted, lineHeight: 1.55 }}>{f.description}</p>
                </div>
                <div style={{
                  flexShrink: 0,
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '5px',
                  background: f.comingSoon ? '#f59e0b18' : unlocked ? `${C.green}18` : `${C.border}`,
                  color: f.comingSoon ? '#f59e0b' : unlocked ? C.green : C.muted,
                  border: `1px solid ${f.comingSoon ? '#f59e0b44' : unlocked ? `${C.green}44` : C.border}`,
                }}>
                  {f.comingSoon ? 'Soon' : unlocked ? 'Active' : 'Locked'}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
