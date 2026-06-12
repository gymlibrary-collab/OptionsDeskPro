import { useEffect, useState, useCallback } from 'react'
import { getSubscribers, SubscriberRow } from '../../api/client'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
  input: '#252836',
  error: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

const TIER_OPTIONS = ['', 'free', 'starter', 'pro', 'enterprise']
const STATUS_OPTIONS = ['', 'active', 'past_due', 'canceled']

interface Props {
  onSelectSubscriber: (id: string) => void
}

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function SubscriberList({ onSelectSubscriber }: Props) {
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const PAGE_SIZE = 50

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getSubscribers({
        page,
        page_size: PAGE_SIZE,
        search: debouncedSearch || undefined,
        tier_key: tierFilter || undefined,
        status: statusFilter || undefined,
      })
      setSubscribers(res.subscribers)
      setTotal(res.total)
    } catch {
      setError('Failed to load subscribers.')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, tierFilter, statusFilter])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const statusColor = (s: string) => s === 'active' ? C.success : s === 'past_due' ? C.warning : C.muted

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: FONT }}>
      <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: C.text }}>Subscribers</h2>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search email or name..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: '8px', color: C.text, padding: '8px 12px', fontSize: '13px', fontFamily: FONT, outline: 'none', flex: '1', minWidth: '200px' }}
        />
        <select
          value={tierFilter}
          onChange={e => { setTierFilter(e.target.value); setPage(1) }}
          style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: '8px', color: C.text, padding: '8px 12px', fontSize: '13px', fontFamily: FONT, cursor: 'pointer' }}
        >
          {TIER_OPTIONS.map(t => <option key={t} value={t}>{t || 'All tiers'}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: '8px', color: C.text, padding: '8px 12px', fontSize: '13px', fontFamily: FONT, cursor: 'pointer' }}
        >
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.error}`, borderRadius: '8px', padding: '12px', fontSize: '13px', color: C.error }}>
          {error} <button onClick={load} style={{ marginLeft: '8px', background: 'transparent', border: 'none', color: C.accent, cursor: 'pointer', fontFamily: FONT, fontSize: '13px' }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div style={{ color: C.muted, fontSize: '14px', padding: '20px 0' }}>Loading...</div>
      ) : subscribers.length === 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '40px', textAlign: 'center', color: C.muted, fontSize: '14px' }}>
          No subscribers found.
        </div>
      ) : (
        <>
          <div style={{ fontSize: '13px', color: C.muted }}>{total} total</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: C.surface }}>
                  {['Email', 'Name', 'Tier', 'Status', 'Joined', 'Last seen', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', color: C.muted, fontWeight: 600, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subscribers.map(sub => (
                  <tr
                    key={sub.id}
                    style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                    onClick={() => onSelectSubscriber(sub.id)}
                    onMouseEnter={e => (e.currentTarget.style.background = C.surface)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 12px', color: C.text }}>{sub.email}</td>
                    <td style={{ padding: '10px 12px', color: C.muted }}>{sub.full_name || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: C.input, borderRadius: '4px', padding: '2px 8px', fontSize: '12px', color: C.accent, fontWeight: 600 }}>{sub.tier_key}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ color: statusColor(sub.subscription_status), fontWeight: 600 }}>{sub.subscription_status}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: C.muted, whiteSpace: 'nowrap' }}>{fmtDate(sub.created_at)}</td>
                    <td style={{ padding: '10px 12px', color: C.muted, whiteSpace: 'nowrap' }}>{fmtDate(sub.last_seen_at)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ color: C.accent, fontSize: '13px' }}>View</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: '6px', color: page === 1 ? C.muted : C.text, padding: '6px 14px', cursor: page === 1 ? 'not-allowed' : 'pointer', fontFamily: FONT, fontSize: '13px' }}
              >
                Prev
              </button>
              <span style={{ fontSize: '13px', color: C.muted }}>{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: '6px', color: page === totalPages ? C.muted : C.text, padding: '6px 14px', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontFamily: FONT, fontSize: '13px' }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
