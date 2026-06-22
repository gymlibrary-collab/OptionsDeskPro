import { useEffect, useState, useCallback } from 'react'
import { getHealthData, debugIvrFetch, HealthData, type IvrFetchDebugResult } from '../../api/client'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
  error: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

export default function HealthPanel() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await getHealthData()
      setHealth(data)
      setLastRefreshed(new Date())
    } catch {
      setError('Failed to load health data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [load])

  if (loading) return <div style={{ color: C.muted, fontSize: '14px', fontFamily: FONT }}>Loading health data...</div>

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: C.text }}>System Health</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {lastRefreshed && <span style={{ fontSize: '12px', color: C.muted }}>Updated {lastRefreshed.toLocaleTimeString()}</span>}
          <button onClick={load} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', color: C.text, padding: '6px 14px', fontSize: '12px', cursor: 'pointer', fontFamily: FONT }}>Refresh</button>
        </div>
      </div>

      {error && <div style={{ color: C.error, fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

      {health && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>

          {/* API status */}
          <Section title="API Status">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: health.api_status === 'ok' ? C.success : C.error }} />
              <span style={{ fontSize: '14px', color: C.text, fontWeight: 600 }}>{health.api_status === 'ok' ? 'Operational' : health.api_status}</span>
            </div>
          </Section>

          {/* Market data source */}
          <Section title="Market Data Source">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: C.success }} />
              <span style={{ fontSize: '14px', color: C.text, fontWeight: 600 }}>{health.market_data_source}</span>
            </div>
          </Section>

          {/* AI / Gemini */}
          <Section title="AI Engine (Gemini)">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: health.gemini_configured ? C.success : C.error }} />
              <span style={{ fontSize: '14px', color: C.text, fontWeight: 600 }}>
                {health.gemini_configured ? 'API key configured' : 'API key not set'}
              </span>
            </div>
            {!health.gemini_configured && (
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: C.warning, lineHeight: 1.5 }}>
                Set GEMINI_API_KEY in Railway → backend service → Variables, then redeploy.
              </p>
            )}
          </Section>

          {/* Active sessions */}
          <Section title="Active Sessions">
            <div style={{ fontSize: '28px', fontWeight: 700, color: C.text, marginBottom: '4px' }}>
              {health.active_sessions_last_15min}
            </div>
            <div style={{ fontSize: '12px', color: C.muted }}>users active in last 15 min</div>
          </Section>

          {/* Request counters */}
          <Section title="Requests (last 24h)">
            {Object.entries(health.requests_last_24h).length === 0 ? (
              <span style={{ fontSize: '13px', color: C.muted }}>No request data.</span>
            ) : (
              Object.entries(health.requests_last_24h).map(([key, count]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid rgba(45,49,72,0.4)` }}>
                  <span style={{ fontSize: '12px', color: C.muted }}>{key.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: '12px', color: C.text, fontWeight: 600 }}>{count}</span>
                </div>
              ))
            )}
          </Section>
        </div>
      )}

      <IvrDebugTool />
    </div>
  )
}

function IvrDebugTool() {
  const [symbol, setSymbol] = useState('AAPL')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<IvrFetchDebugResult | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const run = async () => {
    if (!symbol.trim()) return
    setLoading(true)
    setFetchError(null)
    setResult(null)
    try {
      setResult(await debugIvrFetch(symbol.trim().toUpperCase()))
    } catch (e: unknown) {
      setFetchError((e as { message?: string })?.message ?? 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: '32px', borderTop: `1px solid ${C.border}`, paddingTop: '24px' }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        IVR Source Diagnostic
      </h3>
      <p style={{ margin: '0 0 16px', fontSize: '12px', color: C.muted, lineHeight: 1.6 }}>
        Tests the volradar.com fetch for a symbol. Returns HTTP status, response size, parsed IVR, and the first 2000 chars of HTML so you can tune the parser if needed.
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && run()}
          placeholder="AAPL"
          style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', color: C.text, padding: '7px 12px', fontSize: '13px', width: '120px', outline: 'none', fontFamily: FONT }}
        />
        <button
          onClick={run}
          disabled={loading}
          style={{ background: loading ? C.surface : C.accent, border: 'none', borderRadius: '8px', color: loading ? C.muted : '#fff', padding: '7px 18px', fontSize: '13px', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: FONT }}
        >
          {loading ? 'Fetching…' : 'Test Fetch'}
        </button>
      </div>

      {fetchError && (
        <div style={{ background: '#2d0f0f', border: `1px solid ${C.error}44`, borderRadius: '8px', padding: '10px 14px', color: C.error, fontSize: '12px', marginBottom: '12px' }}>
          {fetchError}
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {result.error && (
            <div style={{ background: '#2d0f0f', border: `1px solid ${C.error}44`, borderRadius: '8px', padding: '10px 14px', color: C.error, fontSize: '12px' }}>
              {result.error}
            </div>
          )}
          {result.attempts?.map((a, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '11px', color: '#38bdf8', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: '12px' }}>{a.url}</div>
              {a.error ? (
                <div style={{ color: C.error, fontSize: '12px' }}>{a.error}</div>
              ) : (
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <div>
                    <div style={{ color: C.muted, fontSize: '10px', marginBottom: '2px', textTransform: 'uppercase' }}>HTTP Status</div>
                    <div style={{ color: a.status_code === 200 ? C.success : C.error, fontWeight: 700, fontSize: '16px' }}>{a.status_code}</div>
                  </div>
                  <div>
                    <div style={{ color: C.muted, fontSize: '10px', marginBottom: '2px', textTransform: 'uppercase' }}>Content Length</div>
                    <div style={{ color: C.text, fontWeight: 600, fontSize: '16px' }}>{a.content_length?.toLocaleString()} chars</div>
                  </div>
                  <div>
                    <div style={{ color: C.muted, fontSize: '10px', marginBottom: '2px', textTransform: 'uppercase' }}>Parsed IVR</div>
                    <div style={{ color: a.parsed_ivr != null ? C.success : C.error, fontWeight: 700, fontSize: '16px' }}>
                      {a.parsed_ivr != null ? a.parsed_ivr.toFixed(1) : 'null — regex no match'}
                    </div>
                  </div>
                </div>
              )}
              {a.html_snippet && (
                <details>
                  <summary style={{ color: C.muted, fontSize: '11px', cursor: 'pointer', userSelect: 'none' }}>HTML snippet (first 2000 chars)</summary>
                  <pre style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '10px', marginTop: '8px', fontSize: '10px', color: C.muted, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '280px', overflowY: 'auto' }}>
                    {a.html_snippet}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '20px' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</h3>
      {children}
    </div>
  )
}
