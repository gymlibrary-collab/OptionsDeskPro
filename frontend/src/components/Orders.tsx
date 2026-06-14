import { useEffect, useState } from 'react'
import { getOrders, Order, getTradeJournalReview, TradeJournalReview } from '../api/client'
import { useEntitlements } from '../context/EntitlementsContext'

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtDate(ts: string) {
  const d = new Date(ts)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

const C = {
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#64748b',
  green: '#22c55e',
  red: '#ef4444',
  accent: '#7c6af7',
  yellow: '#eab308',
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  heading: {
    fontSize: '14px',
    fontWeight: 700,
    color: C.text,
  },
  tableWrap: { overflowX: 'auto' as const },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
    fontVariantNumeric: 'tabular-nums',
  },
  th: {
    padding: '9px 12px',
    textAlign: 'right' as const,
    color: C.muted,
    fontWeight: 600,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: 'nowrap' as const,
    background: C.surface,
  },
  thLeft: {
    padding: '9px 12px',
    textAlign: 'left' as const,
    color: C.muted,
    fontWeight: 600,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: 'nowrap' as const,
    background: C.surface,
  },
  td: {
    padding: '8px 12px',
    textAlign: 'right' as const,
    color: C.text,
    borderBottom: `1px solid ${C.border}22`,
    whiteSpace: 'nowrap' as const,
  },
  tdLeft: {
    padding: '8px 12px',
    textAlign: 'left' as const,
    color: C.text,
    borderBottom: `1px solid ${C.border}22`,
    whiteSpace: 'nowrap' as const,
  },
  badge: (type: 'call' | 'put') => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
    background: type === 'call' ? '#0d1a2d' : '#2d1a2d',
    color: type === 'call' ? '#3b82f6' : '#a855f7',
    border: `1px solid ${type === 'call' ? '#3b82f6' : '#a855f7'}40`,
  }),
  statusBadge: (status: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      filled: { bg: '#0f2d1a', color: '#22c55e' },
      rejected: { bg: '#2d0f0f', color: '#ef4444' },
      pending: { bg: '#1a1a0f', color: '#eab308' },
    }
    const c = map[status] || { bg: '#252836', color: '#94a3b8' }
    return {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 700,
      background: c.bg,
      color: c.color,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.05em',
    }
  },
  actionBadge: (action: string) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
    background: action === 'buy' ? '#0f2d1a' : '#2d0f0f',
    color: action === 'buy' ? '#22c55e' : '#ef4444',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  }),
  empty: {
    textAlign: 'center' as const,
    color: C.muted,
    padding: '40px',
    fontSize: '14px',
  },
  loading: { color: C.muted, fontSize: '13px', padding: '20px 0' },
  stats: {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap' as const,
    fontSize: '13px',
    color: C.muted,
  },
  statItem: {
    display: 'flex',
    gap: '6px',
  },
}

function AIReviewPanel({ review }: { review: TradeJournalReview }) {
  const fields: { label: string; value: string }[] = [
    { label: 'Entry Consistency', value: review.entry_consistency },
    { label: 'Rule Adherence', value: review.rule_adherence },
    { label: 'Behavioural Patterns', value: review.behavioural_patterns },
  ]
  const gradeColor = review.overall_grade.startsWith('A') ? C.green
    : review.overall_grade.startsWith('B') ? C.yellow
    : C.red
  return (
    <div style={{
      background: '#0d1220',
      border: `1px solid ${C.accent}44`,
      borderRadius: '8px',
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          AI Journal Review
        </span>
        <span style={{
          background: `${gradeColor}22`,
          border: `1px solid ${gradeColor}55`,
          borderRadius: '4px',
          padding: '2px 8px',
          fontSize: '12px',
          fontWeight: 700,
          color: gradeColor,
        }}>
          Grade: {review.overall_grade}
        </span>
      </div>
      {fields.map(f => (
        <div key={f.label}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>
            {f.label}
          </div>
          <div style={{ fontSize: '13px', color: C.text, lineHeight: 1.6 }}>{f.value}</div>
        </div>
      ))}
    </div>
  )
}

function OrderRow({ order, showAIReview }: { order: Order; showAIReview: boolean }) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const [review, setReview] = useState<TradeJournalReview | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  const handleAIReview = async () => {
    if (reviewOpen) {
      setReviewOpen(false)
      return
    }
    setReviewOpen(true)
    if (review) return
    setReviewLoading(true)
    setReviewError(null)
    try {
      const result = await getTradeJournalReview(order.id)
      setReview(result)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setReviewError(err?.response?.data?.detail || 'Could not load AI review.')
      setReviewOpen(false)
    } finally {
      setReviewLoading(false)
    }
  }

  return (
    <>
      <tr>
        <td style={{ ...styles.tdLeft, color: C.muted, fontSize: '12px' }}>
          {fmtDate(order.timestamp)}
        </td>
        <td style={{ ...styles.tdLeft, fontWeight: 700, color: C.accent }}>
          {order.symbol}
        </td>
        <td style={styles.td}>{order.expiry}</td>
        <td style={styles.td}>${fmt(order.strike)}</td>
        <td style={styles.td}>
          <span style={styles.badge(order.option_type as 'call' | 'put')}>
            {order.option_type.toUpperCase()}
          </span>
        </td>
        <td style={styles.td}>
          <span style={styles.actionBadge(order.action)}>
            {order.action.toUpperCase()}
          </span>
        </td>
        <td style={styles.td}>{order.quantity}</td>
        <td style={styles.td}>${fmt(order.price)}</td>
        <td style={styles.td}>
          ${fmt(order.price * order.quantity * 100)}
        </td>
        <td style={styles.td}>
          <span style={styles.statusBadge(order.status)}>
            {order.status}
          </span>
        </td>
        <td style={{ ...styles.td, padding: '6px 8px' }}>
          {showAIReview ? (
            <button
              onClick={handleAIReview}
              disabled={reviewLoading}
              style={{
                background: reviewOpen ? `${C.accent}22` : 'transparent',
                border: `1px solid ${C.accent}66`,
                borderRadius: '5px',
                color: C.accent,
                padding: '3px 9px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: reviewLoading ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
                opacity: reviewLoading ? 0.6 : 1,
              }}
            >
              {reviewLoading ? '...' : reviewOpen ? 'Close' : 'AI Review'}
            </button>
          ) : (
            <span
              title="Requires Pro"
              style={{ fontSize: '13px', color: C.muted, cursor: 'default' }}
            >
              🔒
            </span>
          )}
        </td>
      </tr>
      {reviewError && (
        <tr>
          <td colSpan={11} style={{ padding: '0 8px 8px' }}>
            <div style={{ fontSize: '12px', color: C.red, padding: '6px 10px', background: '#2d0f0f', borderRadius: '6px' }}>
              {reviewError}
            </div>
          </td>
        </tr>
      )}
      {reviewOpen && review && (
        <tr>
          <td colSpan={11} style={{ padding: '0 8px 10px' }}>
            <AIReviewPanel review={review} />
          </td>
        </tr>
      )}
    </>
  )
}

export default function Orders() {
  const { entitlements } = useEntitlements()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const hasTradeJournal = entitlements?.features?.trade_journal ?? false

  useEffect(() => {
    getOrders()
      .then(setOrders)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={styles.loading}>Loading orders...</div>

  const filled = orders.filter(o => o.status === 'filled')
  const rejected = orders.filter(o => o.status === 'rejected')
  const totalSpent = filled
    .filter(o => o.action === 'buy')
    .reduce((acc, o) => acc + o.price * o.quantity * 100, 0)

  return (
    <div style={styles.wrap}>
      {orders.length > 0 && (
        <div style={styles.stats}>
          <span style={styles.statItem}>
            <span>Total Orders:</span>
            <strong style={{ color: C.text }}>{orders.length}</strong>
          </span>
          <span style={styles.statItem}>
            <span>Filled:</span>
            <strong style={{ color: C.green }}>{filled.length}</strong>
          </span>
          <span style={styles.statItem}>
            <span>Rejected:</span>
            <strong style={{ color: C.red }}>{rejected.length}</strong>
          </span>
          <span style={styles.statItem}>
            <span>Total Bought:</span>
            <strong style={{ color: C.text }}>${fmt(totalSpent)}</strong>
          </span>
        </div>
      )}

      {orders.length === 0 ? (
        <div style={styles.empty}>No orders yet. Use the Order Entry panel to place trades.</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.thLeft}>Time</th>
                <th style={styles.thLeft}>Symbol</th>
                <th style={styles.th}>Expiry</th>
                <th style={styles.th}>Strike</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Qty</th>
                <th style={styles.th}>Fill Price</th>
                <th style={styles.th}>Total Value</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>AI</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <OrderRow key={order.id} order={order} showAIReview={hasTradeJournal} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
