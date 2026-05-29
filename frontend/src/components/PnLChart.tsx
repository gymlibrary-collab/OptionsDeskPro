import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import api from '../api/client'

interface Snapshot {
  snapshot_date: string
  portfolio_value: number
  cash: number
  positions_value: number
  total_pnl: number
}

const formatDollar = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

const formatDate = (d: string) => {
  const parts = d.split('-')
  return `${parts[1]}/${parts[2]}`
}

interface CustomTooltipProps {
  active?: boolean
  payload?: any[]
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null
  const data: Snapshot = payload[0].payload
  const pnlColor = data.total_pnl >= 0 ? '#22c55e' : '#ef4444'
  return (
    <div style={tooltipStyles.box}>
      <p style={tooltipStyles.date}>{data.snapshot_date}</p>
      <p style={tooltipStyles.value}>{formatDollar(data.portfolio_value)}</p>
      <p style={{ ...tooltipStyles.pnl, color: pnlColor }}>
        P&amp;L: {data.total_pnl >= 0 ? '+' : ''}{formatDollar(data.total_pnl)}
      </p>
      <p style={tooltipStyles.sub}>Cash: {formatDollar(data.cash)}</p>
      <p style={tooltipStyles.sub}>Positions: {formatDollar(data.positions_value)}</p>
    </div>
  )
}

const tooltipStyles: Record<string, React.CSSProperties> = {
  box: {
    background: '#1a1d27',
    border: '1px solid #2d3148',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '12px',
    color: '#e2e8f0',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace",
  },
  date: { margin: '0 0 4px 0', color: '#94a3b8', fontSize: '11px' },
  value: { margin: '0 0 4px 0', fontWeight: 700, fontSize: '15px' },
  pnl: { margin: '0 0 4px 0', fontWeight: 600 },
  sub: { margin: '0', color: '#64748b', fontSize: '11px' },
}

export default function PnLChart() {
  const [data, setData] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Snapshot[]>('/auth/pnl-history')
      .then(r => {
        setData(r.data)
        setLoading(false)
      })
      .catch(() => {
        setError('Could not load P&L history')
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div style={styles.empty}>
        <span style={styles.emptyText}>Loading P&amp;L history…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.empty}>
        <span style={{ ...styles.emptyText, color: '#ef4444' }}>{error}</span>
      </div>
    )
  }

  if (data.length < 2) {
    return (
      <div style={styles.empty}>
        <span style={styles.emptyText}>
          No P&amp;L history yet. Trade some options and come back tomorrow!
        </span>
      </div>
    )
  }

  const startValue = data[0].portfolio_value
  const latest = data[data.length - 1]
  const overallPnL = latest.portfolio_value - startValue
  const lineColor = overallPnL >= 0 ? '#22c55e' : '#ef4444'
  const pnlColor = overallPnL >= 0 ? '#22c55e' : '#ef4444'

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Portfolio Value</span>
        <span style={{ ...styles.pnlBadge, color: pnlColor, borderColor: pnlColor }}>
          {overallPnL >= 0 ? '+' : ''}{formatDollar(overallPnL)} all-time P&amp;L
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" />
          <XAxis
            dataKey="snapshot_date"
            tickFormatter={formatDate}
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={{ stroke: '#2d3148' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="portfolio_value"
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: lineColor, stroke: '#1a1d27', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#1a1d27',
    border: '1px solid #2d3148',
    borderRadius: '10px',
    padding: '16px',
    marginTop: '16px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#94a3b8',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace",
  },
  pnlBadge: {
    fontSize: '12px',
    fontWeight: 600,
    border: '1px solid',
    borderRadius: '20px',
    padding: '2px 10px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace",
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '80px',
    background: '#1a1d27',
    border: '1px solid #2d3148',
    borderRadius: '10px',
    marginTop: '16px',
  },
  emptyText: {
    fontSize: '13px',
    color: '#64748b',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace",
  },
}
