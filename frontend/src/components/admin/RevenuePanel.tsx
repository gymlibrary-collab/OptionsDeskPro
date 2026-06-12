import { useEffect, useState, useCallback } from 'react'
import { getRevenueMetrics, exportRevenueCsv, RevenueMetrics } from '../../api/client'

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

const fmtUsd = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)

export default function RevenuePanel() {
  const [metrics, setMetrics] = useState<RevenueMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getRevenueMetrics()
      setMetrics(data)
    } catch {
      setError('Failed to load revenue metrics.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleExport = async () => {
    setExportLoading(true)
    setExportError(null)
    try {
      const today = new Date()
      const from = new Date(today.getFullYear(), today.getMonth() - 11, 1).toISOString().slice(0, 10)
      const to = today.toISOString().slice(0, 10)
      const blob = await exportRevenueCsv(from, to)
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = 'revenue.csv'
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch {
      setExportError('Export failed. Please try again.')
    } finally {
      setExportLoading(false)
    }
  }

  if (loading) return <div style={{ color: C.muted, fontSize: '14px', fontFamily: FONT }}>Loading revenue metrics...</div>
  if (error || !metrics) return <div style={{ color: C.error, fontSize: '14px', fontFamily: FONT }}>{error || 'No data.'}</div>

  const TIER_COLORS: Record<string, string> = { free: C.muted, starter: '#60a5fa', pro: C.accent, enterprise: C.success }

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: C.text }}>Revenue</h2>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          <button
            onClick={handleExport}
            disabled={exportLoading}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', color: C.text, padding: '7px 14px', fontSize: '13px', fontWeight: 600, cursor: exportLoading ? 'not-allowed' : 'pointer', fontFamily: FONT, opacity: exportLoading ? 0.7 : 1 }}
          >
            {exportLoading ? 'Exporting...' : 'Export CSV'}
          </button>
          {exportError && (
            <span style={{ fontSize: '12px', color: C.error }}>{exportError}</span>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KpiCard label="MRR" value={fmtUsd(metrics.mrr_current_usd)} />
        <KpiCard label="New this month" value={String(metrics.new_this_month)} accent={C.success} />
        <KpiCard label="Churned this month" value={String(metrics.churned_this_month)} accent={metrics.churned_this_month > 0 ? C.error : undefined} />
        <KpiCard label="Past due" value={String(metrics.past_due_count)} accent={metrics.past_due_count > 0 ? C.warning : undefined} />
        <KpiCard label="At-risk MRR" value={fmtUsd(metrics.past_due_amount_at_risk_usd)} accent={metrics.past_due_amount_at_risk_usd > 0 ? C.warning : undefined} />
      </div>

      {/* Subscribers by tier */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: C.text }}>Subscribers by tier</h3>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {Object.entries(metrics.active_subscribers_by_tier).map(([tier, count]) => (
            <div key={tier} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: TIER_COLORS[tier] || C.text }}>{count}</span>
              <span style={{ fontSize: '12px', color: C.muted, textTransform: 'capitalize' }}>{tier}</span>
            </div>
          ))}
        </div>
      </div>

      {/* MRR by month */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '20px' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: C.text }}>MRR trend</h3>
        {metrics.mrr_by_month.length === 0 ? (
          <div style={{ color: C.muted, fontSize: '13px' }}>No monthly data yet.</div>
        ) : (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', overflowX: 'auto', paddingBottom: '4px' }}>
            {(() => {
              const maxMrr = Math.max(...metrics.mrr_by_month.map(m => m.mrr_usd), 1)
              return metrics.mrr_by_month.map(m => (
                <div key={m.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '48px' }}>
                  <span style={{ fontSize: '11px', color: C.muted }}>{fmtUsd(m.mrr_usd)}</span>
                  <div style={{ width: '40px', height: `${Math.max(8, Math.round((m.mrr_usd / maxMrr) * 80))}px`, background: C.accent, borderRadius: '4px 4px 0 0' }} />
                  <span style={{ fontSize: '11px', color: C.muted, whiteSpace: 'nowrap' }}>{m.month}</span>
                </div>
              ))
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '16px' }}>
      <div style={{ fontSize: '22px', fontWeight: 700, color: accent || C.text, marginBottom: '4px' }}>{value}</div>
      <div style={{ fontSize: '12px', color: C.muted }}>{label}</div>
    </div>
  )
}
