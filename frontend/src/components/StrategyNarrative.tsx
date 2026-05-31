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
            <Paragraphs text={narrative.profit_scenario} />
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
            <Paragraphs text={narrative.loss_scenario} />
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

      {/* Execution Checklist */}
      <div
        style={{
          background: '#0d0f18',
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          padding: '14px 16px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: C.muted,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            Execution Checklist
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
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            {copied ? 'Copied!' : 'Copy Checklist'}
          </button>
        </div>
        <ol
          style={{
            margin: 0,
            paddingLeft: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {narrative.execution_checklist.map((step, i) => (
            <li
              key={i}
              style={{
                fontSize: '12px',
                color: C.text,
                lineHeight: 1.55,
              }}
            >
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
