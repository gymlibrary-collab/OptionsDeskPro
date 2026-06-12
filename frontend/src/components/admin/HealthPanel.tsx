import { useEffect, useState, useCallback } from 'react'
import { getHealthData, HealthData } from '../../api/client'

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

  const alertColor = (level: string) => level === 'ok' ? C.success : level === 'warning' ? C.warning : C.error

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

          {/* Market data credits */}
          <Section title="Market Data Credits">
            <div style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: C.muted }}>Today</span>
                <span style={{ fontSize: '13px', color: alertColor(health.market_data_credits.alert_level), fontWeight: 600 }}>
                  {health.market_data_credits.calls_today} / {health.market_data_credits.limit}
                </span>
              </div>
              <div style={{ height: '6px', background: C.border, borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, health.market_data_credits.pct)}%`,
                  background: alertColor(health.market_data_credits.alert_level),
                  borderRadius: '3px',
                }} />
              </div>
            </div>
            <span style={{ fontSize: '12px', color: alertColor(health.market_data_credits.alert_level), fontWeight: 600 }}>
              {health.market_data_credits.pct.toFixed(0)}% — {health.market_data_credits.alert_level.toUpperCase()}
            </span>
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
