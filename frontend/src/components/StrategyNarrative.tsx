import { useState } from 'react'

export interface Narrative {
  headline: string
  market_snapshot: string
  iv_context: string
  why_this_strategy: string
  trade_plain_english: string
  profit_scenario: string
  loss_scenario: string
  defensive_tactic: string
  trade_ticket?: string
  execution_checklist: string[]
  confirmation_summary: string
}

interface Props {
  narrative: Narrative
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
}

function Paragraphs({ text }: { text: string }) {
  const paras = text.split('\n\n').filter(Boolean)
  return (
    <>
      {paras.map((para, i) => (
        <p key={i} style={{ margin: i === 0 ? 0 : '10px 0 0', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {para}
        </p>
      ))}
    </>
  )
}

function Panel({
  title,
  children,
  borderColor,
}: {
  title: string
  children: React.ReactNode
  borderColor?: string
}) {
  return (
    <div
      style={{
        background: C.surface2,
        border: `1px solid ${borderColor || C.border}`,
        borderRadius: '8px',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div
        style={{
          fontSize: '10px',
          fontWeight: 700,
          color: borderColor || C.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: '13px',
          color: C.text,
          lineHeight: 1.6,
        }}
      >
        {children}
      </div>
    </div>
  )
}

export default function StrategyNarrative({ narrative }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopyChecklist = () => {
    const text = narrative.execution_checklist
      .map((step, i) => `${i + 1}. ${step}`)
      .join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        marginTop: '14px',
      }}
    >
      {/* Headline */}
      <div
        style={{
          fontSize: '15px',
          fontWeight: 700,
          color: C.accent,
          lineHeight: 1.5,
          padding: '10px 14px',
          background: `${C.accent}11`,
          border: `1px solid ${C.accent}33`,
          borderRadius: '8px',
        }}
      >
        {narrative.headline}
      </div>

      {/* 2x2 Info Panels */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '10px',
        }}
      >
        <Panel title="Market Snapshot"><Paragraphs text={narrative.market_snapshot} /></Panel>
        <Panel title="Why Options Are Priced This Way"><Paragraphs text={narrative.iv_context} /></Panel>
        <Panel title="Why This Strategy"><Paragraphs text={narrative.why_this_strategy} /></Panel>
        <Panel title="The Trade in Simple Terms"><Paragraphs text={narrative.trade_plain_english} /></Panel>
      </div>

      {/* Profit & Loss */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '10px',
        }}
      >
        <div
          style={{
            background: '#0f2d1a',
            border: `1px solid ${C.green}44`,
            borderRadius: '8px',
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: C.green,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '8px',
            }}
          >
            If It Works — Profit Scenario
          </div>
          <div style={{ fontSize: '13px', color: C.text, lineHeight: 1.6 }}>
            {narrative.profit_scenario
              ? <Paragraphs text={narrative.profit_scenario} />
              : <span style={{ color: C.muted, fontStyle: 'italic' }}>Profit scenario requires live options chain data (specific strikes and breakevens). The strategy recommendation above is still valid.</span>
            }
          </div>
        </div>

        <div
          style={{
            background: '#2d0f0f',
            border: `1px solid ${C.red}44`,
            borderRadius: '8px',
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: C.red,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '8px',
            }}
          >
            If It Doesn't — Loss Scenario
          </div>
          <div style={{ fontSize: '13px', color: C.text, lineHeight: 1.6 }}>
            {narrative.loss_scenario
              ? <Paragraphs text={narrative.loss_scenario} />
              : <span style={{ color: C.muted, fontStyle: 'italic' }}>Loss scenario requires live options chain data (specific strikes and breakevens). The strategy recommendation above is still valid.</span>
            }
          </div>
        </div>
      </div>

      {/* Defensive Tactic */}
      <div
        style={{
          background: '#2d1f0a',
          border: `1px solid ${C.amber}44`,
          borderRadius: '8px',
          padding: '14px 16px',
        }}
      >
        <div
          style={{
            fontSize: '10px',
            fontWeight: 700,
            color: C.amber,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '8px',
          }}
        >
          If It Goes Wrong — Defensive Tactic
        </div>
        <div style={{ fontSize: '13px', color: C.text, lineHeight: 1.6 }}>
          <Paragraphs text={narrative.defensive_tactic} />
        </div>
      </div>

      {/* Execution Section — only shown when live options data was available */}
      {narrative.execution_checklist.length === 0 && (
        <div style={{
          background: C.surface2,
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '12px',
          color: C.muted,
        }}>
          <span style={{ fontWeight: 700, color: C.amber }}>Execution guide unavailable.</span>
          {' '}Live options chain data could not be fetched for this symbol (yfinance). The analysis above is still valid — once market data is available, expand this strategy again for the full step-by-step execution guide.
        </div>
      )}
      {narrative.execution_checklist.length > 0 && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Trade Ticket */}
        {narrative.trade_ticket && (
          <div style={{
            background: '#0a1628',
            border: `1px solid #3b82f688`,
            borderRadius: '8px',
            padding: '14px 16px',
          }}>
            <div style={{
              fontSize: '10px',
              fontWeight: 700,
              color: '#3b82f6',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '8px',
            }}>
              Order Ticket — Enter This Exactly in Your Broker
            </div>
            <div style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '13px',
              fontWeight: 700,
              color: '#e2e8f0',
              background: '#0f1e38',
              border: '1px solid #3b82f633',
              borderRadius: '6px',
              padding: '10px 14px',
              lineHeight: 1.6,
              letterSpacing: '0.02em',
            }}>
              {narrative.trade_ticket}
            </div>
            <div style={{ fontSize: '11px', color: C.muted, marginTop: '6px' }}>
              This is the exact combined order to place. Follow the step-by-step guide below to enter it in your broker.
            </div>
          </div>
        )}

        {/* Step-by-step Checklist */}
        <div
          style={{
            background: '#0d0f18',
            border: `1px solid ${C.border}`,
            borderRadius: '8px',
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Step-by-Step Execution Guide
            </div>
            <button
              onClick={handleCopyChecklist}
              style={{
                background: copied ? `${C.green}22` : C.surface2,
                border: `1px solid ${copied ? C.green : C.border}`,
                color: copied ? C.green : C.muted,
                borderRadius: '5px',
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                transition: 'all 0.15s',
              }}
            >
              {copied ? 'Copied!' : 'Copy Guide'}
            </button>
          </div>
          <ol
            style={{
              margin: 0,
              paddingLeft: '0',
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {narrative.execution_checklist.map((step, i) => {
              const firstWord = step.split(' ')[0]
              const isKeyword = /^(OPEN|NAVIGATE|SELECT|LEG|COMBINE|SET|MARK|HARD)/.test(firstWord)
              const colonIdx = step.indexOf(':')
              const label = isKeyword && colonIdx > 0 ? step.slice(0, colonIdx) : null
              const body  = label ? step.slice(colonIdx + 1).trim() : step

              return (
                <li
                  key={i}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                    background: '#13151f',
                    borderRadius: '6px',
                    padding: '9px 12px',
                    border: `1px solid ${C.border}44`,
                  }}
                >
                  <span style={{
                    flexShrink: 0,
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: C.accent + '22',
                    border: `1px solid ${C.accent}55`,
                    color: C.accent,
                    fontSize: '10px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: '1px',
                  }}>
                    {i + 1}
                  </span>
                  <div style={{ fontSize: '12px', color: C.text, lineHeight: 1.6 }}>
                    {label && (
                      <span style={{ fontWeight: 700, color: C.accent, marginRight: '6px' }}>
                        {label}:
                      </span>
                    )}
                    {body}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
      )}
    </div>
  )
}
