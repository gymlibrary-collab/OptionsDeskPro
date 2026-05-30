import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { getPnLHistory } from '../api/client'

interface Snapshot {
  snapshot_date: string
  portfolio_value: number
  total_pnl: number
  cash: number
}

const formatDollar = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })

const tooltipStyles = {
  box: { background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 6, padding: '8px 12px', fontSize: 12 },
  date: { color: '#64748b', marginBottom: 4 },
  value: { color: '#e2e8f0', fontWeight: 700, marginBottom: 2 },
  pnl: { fontWeight: 600 },
}

interface CustomTooltipProps {
  active?: boolean
  payload?: any[]
  label?: string
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null
  const data: Snapshot = payload[0].payload
  const pnlColor = data.total_pnl >= 0 ? '#22c55e' : '#ef4444'
  return (
    <div style={tooltipStyles.box}>
      <p style={tooltipStyles.date}>{data.snapshot_date}</p>
      <p style={tooltipStyles.value}>{formatDollar(data.portfolio_value)}</p>
      <p style={{ ...tooltipStyles.pnl, color: pnlColor }}>
        {data.total_pnl >= 0 ? '+' : ''}{formatDollar(data.total_pnl)}
      </p>
    </div>
  )
}

export default function PnLChart() {
  const [data, setData] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPnLHistory()
      .then((d: Snapshot[]) => setData(d || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading || data.length === 0) return null

  const vals = data.map(d => d.portfolio_value)
  const minVal = Math.min(...vals)
  const maxVal = Math.max(...vals)
  const pad = (maxVal - minVal) * 0.1 || 5000
  const lastPnl = data[data.length - 1]?.total_pnl ?? 0
  const lineColor = lastPnl >= 0 ? '#22c55e' : '#ef4444'

  return (
    <div style={{ marginTop: 24, background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8, padding: '16px 8px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, paddingLeft: 8 }}>
        Portfolio P&amp;L History
        <span style={{ marginLeft: 12, color: lineColor, fontSize: 14 }}>
          {lastPnl >= 0 ? '+' : ''}{formatDollar(lastPnl)}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" />
          <XAxis
            dataKey="snapshot_date"
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickFormatter={v => v.slice(5)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
            domain={[minVal - pad, maxVal + pad]}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={100000} stroke="#2d3148" strokeDasharray="4 4" label={{ value: 'Start', fill: '#64748b', fontSize: 10 }} />
          <Line
            type="monotone"
            dataKey="portfolio_value"
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: lineColor }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
