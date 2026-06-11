import React from 'react'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
}

export default function AISettings() {
  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 0' }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '28px' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, color: C.text }}>
          AI Features
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: '14px', color: C.muted, lineHeight: 1.6 }}>
          AI-powered strategy analysis and narrative generation is built into the Strategy Scanner.
          Select any ticker in the scanner and run a deep analysis to get a plain-English breakdown
          of the recommended strategy, IV environment, directional bias, earnings context, and more.
        </p>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '16px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: C.muted, lineHeight: 1.6 }}>
            <strong style={{ color: C.accent }}>How to use:</strong> Go to the Strategy Scanner tab,
            enter a ticker in your watchlist, and click <em>Deep Analysis</em> on any strategy card.
            The AI narrative covers IV rank, directional bias, earnings awareness, news sentiment,
            options flow, and a plain-English trade rationale.
          </p>
        </div>
      </div>
    </div>
  )
}
