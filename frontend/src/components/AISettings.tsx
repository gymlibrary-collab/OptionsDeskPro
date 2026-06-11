import { useEffect, useState, useRef } from 'react'
import {
  AISettings as AISettingsType,
  getAISettings,
  updateAISettings,
  aiChat,
} from '../api/client'

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
}

const FEATURES: {
  key: keyof AISettingsType
  label: string
  description: string
  tier: string
}[] = [
  {
    key: 'narrative_enabled',
    label: 'AI Coach Insight',
    description:
      'Adds a 3–5 sentence coaching paragraph to the Trade Panel explaining why a setup has edge right now — grounded in the exact IV rank, bias, and risk numbers.',
    tier: 'Beta · All users',
  },
  {
    key: 'chat_enabled',
    label: 'Portfolio Chat',
    description:
      'Ask natural-language questions about your open positions, P&L, and portfolio health. Answers are grounded in your actual trades.',
    tier: 'Beta · All users',
  },
  {
    key: 'risk_summary_enabled',
    label: 'AI Risk Overview',
    description:
      'One-paragraph risk analysis of your entire portfolio — most urgent action, overall health, and one specific recommendation.',
    tier: 'Beta · All users',
  },
  {
    key: 'strategy_reasoning_enabled',
    label: 'Strategy Reasoning',
    description:
      'Why is this the top-ranked strategy for this ticker right now? 3–4 sentences on the IV+bias combination, concrete edge, and what could go wrong.',
    tier: 'Beta · All users',
  },
  {
    key: 'earnings_awareness_enabled',
    label: 'Earnings Awareness',
    description:
      'Adjusts the recommended expiry cycle to account for upcoming earnings. ' +
      'Premium sellers are routed to a pre-earnings expiry (avoiding IV crush). ' +
      'Premium buyers are routed to a post-earnings expiry (capturing the move). ' +
      'The trade narrative explains the adjustment.',
    tier: 'Beta · All users',
  },
]

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div
      onClick={() => !disabled && onChange(!enabled)}
      style={{
        width: '42px', height: '24px', borderRadius: '12px',
        background: enabled ? C.accent : C.surface2,
        cursor: disabled ? 'default' : 'pointer',
        position: 'relative', transition: 'background 0.2s',
        border: `1px solid ${enabled ? C.accent : '#3a3f5c'}`,
        flexShrink: 0, opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: '3px',
        left: enabled ? '20px' : '3px',
        width: '16px', height: '16px', borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      }} />
    </div>
  )
}

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setLoading(true)
    try {
      const { answer } = await aiChat(q)
      setMessages(prev => [...prev, { role: 'assistant', text: answer }])
    } catch (e: any) {
      const detail = e?.response?.data?.detail || 'Something went wrong — please try again.'
      setMessages(prev => [...prev, { role: 'assistant', text: detail }])
    } finally {
      setLoading(false)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div style={{
      background: C.surface2, borderRadius: '10px', border: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column', maxHeight: '420px',
    }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: C.accent }}>Portfolio Chat</span>
        <span style={{ fontSize: '11px', color: C.muted, marginLeft: '8px' }}>
          Ask about your positions, P&L, or strategy ideas
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '120px' }}>
        {messages.length === 0 && (
          <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '16px 0' }}>
            Ask something like "Which position has the most risk?" or "Am I net long or short volatility?"
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            background: m.role === 'user' ? C.accent + '22' : C.surface,
            border: `1px solid ${m.role === 'user' ? C.accent + '44' : C.border}`,
            borderRadius: m.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
            padding: '8px 12px',
            fontSize: '12px',
            color: C.text,
            lineHeight: 1.6,
          }}>
            {m.text}
          </div>
        ))}
        {loading && (
          <div style={{
            alignSelf: 'flex-start', background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: '10px 10px 10px 2px', padding: '8px 12px', fontSize: '12px', color: C.muted,
          }}>
            Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '8px' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ask about your portfolio…"
          rows={2}
          style={{
            flex: 1, background: C.surface, border: `1px solid #3a3f5c`, borderRadius: '6px',
            color: C.text, padding: '8px 10px', fontSize: '12px', resize: 'none',
            outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          style={{
            background: C.accent, border: 'none', borderRadius: '6px', color: '#fff',
            padding: '0 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            opacity: !input.trim() || loading ? 0.5 : 1, alignSelf: 'stretch',
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

export default function AISettings() {
  const [settings, setSettings] = useState<AISettingsType | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getAISettings().then(setSettings).catch(() => setError('Failed to load AI settings'))
  }, [])

  const toggle = async (key: keyof AISettingsType) => {
    if (!settings || saving) return
    const updated = { ...settings, [key]: !settings[key] }
    setSettings(updated)
    setSaving(true)
    try {
      await updateAISettings(updated)
    } catch {
      setSettings(settings)
      setError('Failed to save — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: '680px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: C.text, marginBottom: '4px' }}>AI Features</div>
        <div style={{ fontSize: '13px', color: C.muted, lineHeight: 1.5 }}>
          Powered by Claude. Toggle features on or off — they apply instantly. In a future release, some
          features will be gated by subscription tier.
        </div>
        {error && <div style={{ marginTop: '8px', fontSize: '12px', color: C.red }}>{error}</div>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
        {FEATURES.map(f => (
          <div
            key={f.key}
            style={{
              background: C.surface, border: `1px solid ${settings?.[f.key] ? C.accent + '55' : C.border}`,
              borderRadius: '10px', padding: '14px 16px',
              display: 'flex', alignItems: 'flex-start', gap: '14px',
              transition: 'border-color 0.2s',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{f.label}</span>
                <span style={{
                  fontSize: '10px', padding: '1px 7px', borderRadius: '8px',
                  background: '#1a1440', border: `1px solid ${C.accent}44`, color: C.accent,
                  fontWeight: 600, whiteSpace: 'nowrap',
                }}>{f.tier}</span>
              </div>
              <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.55 }}>{f.description}</div>
            </div>
            <Toggle
              enabled={!!settings?.[f.key]}
              onChange={() => toggle(f.key)}
              disabled={!settings || saving}
            />
          </div>
        ))}
      </div>

      {!settings && (
        <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
          Loading settings…
        </div>
      )}

      {settings?.chat_enabled && (
        <ChatPanel />
      )}
    </div>
  )
}
