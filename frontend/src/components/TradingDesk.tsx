import React from 'react'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
  input: '#252836',
}

interface PanelProps {
  title: string
  children?: React.ReactNode
}

function Panel({ title, children }: PanelProps) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: '10px',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      minHeight: '320px',
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
      }}>
        <div style={{ width: '3px', height: '16px', background: C.accent, borderRadius: '2px' }} />
        <span style={{ fontWeight: 700, fontSize: '13px', color: C.text, letterSpacing: '0.01em' }}>
          {title}
        </span>
      </div>
      <div style={{ flex: 1, padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {children ?? (
          <span style={{ color: C.muted, fontSize: '13px' }}>Coming soon</span>
        )}
      </div>
    </div>
  )
}

export default function TradingDesk() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: 'repeat(2, 1fr)',
      gap: '16px',
      height: '100%',
      minHeight: 0,
    }}>
      <Panel title="Results Reporting" />
      <Panel title="Buzz about Stocks" />
      <Panel title="Buzz about Crypto" />
      <Panel title="Buzz about Selected Stocks" />
    </div>
  )
}
