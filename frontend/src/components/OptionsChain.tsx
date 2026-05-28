import React, { useEffect, useState, useCallback } from 'react'
import { getOptionsChain, OptionsChainResponse, OptionContract } from '../api/client'
import { OrderPrefill } from '../App'

interface Props {
  symbol: string
  onRowClick: (prefill: OrderPrefill) => void
}

function fmt(n: number | undefined, d = 2) {
  if (n === undefined || n === null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtVol(n: number | undefined) {
  if (!n) return '—'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#64748b',
  accent: '#7c6af7',
  itmCall: '#0d2318',
  itmPut: '#210d0d',
  hoverRow: '#252836',
  green: '#22c55e',
  red: '#ef4444',
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  select: {
    background: '#252836',
    border: '1px solid #3a3f5c',
    borderRadius: '6px',
    color: '#e2e8f0',
    padding: '6px 10px',
    fontSize: '13px',
    outline: 'none',
    cursor: 'pointer',
  },
  label: { fontSize: '13px', color: C.muted },
  tableWrap: { overflowX: 'auto' as const },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '12px',
    fontVariantNumeric: 'tabular-nums',
  },
  thead: { background: '#1a1d27', position: 'sticky' as const, top: 0, zIndex: 1 },
  th: (align: 'left' | 'right' | 'center' = 'right') => ({
    padding: '8px 10px',
    color: C.muted,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    fontSize: '10px',
    borderBottom: `1px solid ${C.border}`,
    textAlign: align,
    whiteSpace: 'nowrap' as const,
  }),
  strikeCell: {
    padding: '6px 12px',
    textAlign: 'center' as const,
    fontWeight: 700,
    fontSize: '13px',
    color: '#e2e8f0',
    background: '#252836',
    borderLeft: `1px solid ${C.border}`,
    borderRight: `1px solid ${C.border}`,
    whiteSpace: 'nowrap' as const,
  },
  strikeITM: {
    padding: '6px 12px',
    textAlign: 'center' as const,
    fontWeight: 700,
    fontSize: '13px',
    color: '#7c6af7',
    background: '#1e1a3a',
    borderLeft: `1px solid #3a3570`,
    borderRight: `1px solid #3a3570`,
    whiteSpace: 'nowrap' as const,
  },
  loading: { color: C.muted, fontSize: '13px', padding: '20px 0' },
  error: { color: C.red, fontSize: '13px', padding: '20px 0' },
  nodata: { color: C.muted, fontSize: '13px', padding: '20px 0', textAlign: 'center' as const },
  sectionHeader: {
    padding: '6px 10px',
    textAlign: 'center' as const,
    fontWeight: 700,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    borderBottom: `1px solid ${C.border}`,
  },
}

function callRowStyle(itm: boolean, hover: boolean) {
  return {
    background: hover ? '#1d2d1e' : itm ? C.itmCall : 'transparent',
    cursor: 'pointer',
    transition: 'background 0.1s',
    borderBottom: `1px solid ${C.border}22`,
  }
}

function putRowStyle(itm: boolean, hover: boolean) {
  return {
    background: hover ? '#2d1a1a' : itm ? C.itmPut : 'transparent',
    cursor: 'pointer',
    transition: 'background 0.1s',
    borderBottom: `1px solid ${C.border}22`,
  }
}

function td(align: 'left' | 'right' | 'center' = 'right', color?: string) {
  return {
    padding: '5px 10px',
    textAlign: align,
    color: color || C.text,
    whiteSpace: 'nowrap' as const,
  }
}

function ivColor(iv: number) {
  if (iv > 0.8) return '#ef4444'
  if (iv > 0.5) return '#f97316'
  if (iv > 0.3) return '#eab308'
  return '#94a3b8'
}

export default function OptionsChain({ symbol, onRowClick }: Props) {
  const [data, setData] = useState<OptionsChainResponse | null>(null)
  const [selectedExpiry, setSelectedExpiry] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hoveredStrike, setHoveredStrike] = useState<number | null>(null)
  const [hoveredSide, setHoveredSide] = useState<'call' | 'put' | null>(null)

  const fetchChain = useCallback(async (expiry?: string) => {
    setLoading(true)
    setError('')
    try {
      const d = await getOptionsChain(symbol, expiry || undefined)
      setData(d)
      if (d.expiry) setSelectedExpiry(d.expiry)
    } catch (e: any) {
      setError(e?.message || 'Failed to load options chain')
    } finally {
      setLoading(false)
    }
  }, [symbol])

  useEffect(() => {
    setData(null)
    setSelectedExpiry('')
    fetchChain()
  }, [symbol])

  const handleExpiryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value
    setSelectedExpiry(v)
    fetchChain(v)
  }

  const handleCallClick = (call: OptionContract) => {
    if (!data) return
    onRowClick({
      symbol: data.symbol,
      expiry: data.expiry,
      strike: call.strike,
      option_type: 'call',
      bid: call.bid,
      ask: call.ask,
    })
  }

  const handlePutClick = (put: OptionContract) => {
    if (!data) return
    onRowClick({
      symbol: data.symbol,
      expiry: data.expiry,
      strike: put.strike,
      option_type: 'put',
      bid: put.bid,
      ask: put.ask,
    })
  }

  if (loading) return <div style={styles.loading}>Loading options chain for {symbol}...</div>
  if (error) return <div style={styles.error}>Error: {error}</div>
  if (!data || (!data.calls.length && !data.puts.length)) {
    return <div style={styles.nodata}>No options data available for {symbol}</div>
  }

  const spotPrice = data.quote?.price || 0

  // Build a merged strike list
  const callsByStrike = new Map<number, OptionContract>()
  const putsByStrike = new Map<number, OptionContract>()
  const allStrikes = new Set<number>()

  for (const c of data.calls) {
    callsByStrike.set(c.strike, c)
    allStrikes.add(c.strike)
  }
  for (const p of data.puts) {
    putsByStrike.set(p.strike, p)
    allStrikes.add(p.strike)
  }

  const sortedStrikes = Array.from(allStrikes).sort((a, b) => a - b)

  // Find nearest ATM strike
  let atmStrike = sortedStrikes[0]
  let minDiff = Infinity
  for (const s of sortedStrikes) {
    const diff = Math.abs(s - spotPrice)
    if (diff < minDiff) {
      minDiff = diff
      atmStrike = s
    }
  }

  // Focus on strikes near ATM (show ~30 above/below)
  const atmIdx = sortedStrikes.indexOf(atmStrike)
  const range = 20
  const visibleStrikes = sortedStrikes.slice(
    Math.max(0, atmIdx - range),
    Math.min(sortedStrikes.length, atmIdx + range + 1)
  )

  const callHeaders = ['Bid', 'Ask', 'Last', 'Vol', 'OI', 'IV', 'Δ Delta']
  const putHeaders = ['Δ Delta', 'IV', 'OI', 'Vol', 'Last', 'Ask', 'Bid']

  return (
    <div style={styles.wrap}>
      <div style={styles.controls}>
        <span style={styles.label}>Expiry:</span>
        <select style={styles.select} value={selectedExpiry} onChange={handleExpiryChange}>
          {data.expirations.map(e => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <span style={{ ...styles.label, marginLeft: '8px' }}>
          Spot: <strong style={{ color: '#e2e8f0' }}>${fmt(spotPrice)}</strong>
        </span>
        <span style={styles.label}>
          ATM: <strong style={{ color: '#7c6af7' }}>${fmt(atmStrike)}</strong>
        </span>
        {data.calls.length > 0 && (
          <span style={styles.label}>
            Showing {visibleStrikes.length} strikes
          </span>
        )}
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead style={styles.thead}>
            <tr>
              <th
                colSpan={callHeaders.length}
                style={{
                  ...styles.sectionHeader,
                  color: '#22c55e',
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                Calls
              </th>
              <th
                style={{
                  ...styles.th('center'),
                  background: '#252836',
                  fontSize: '11px',
                  color: '#e2e8f0',
                }}
              >
                Strike
              </th>
              <th
                colSpan={putHeaders.length}
                style={{
                  ...styles.sectionHeader,
                  color: '#ef4444',
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                Puts
              </th>
            </tr>
            <tr>
              {callHeaders.map(h => (
                <th key={h} style={styles.th()}>{h}</th>
              ))}
              <th style={styles.th('center')}>—</th>
              {putHeaders.map(h => (
                <th key={h} style={styles.th()}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleStrikes.map(strike => {
              const call = callsByStrike.get(strike)
              const put = putsByStrike.get(strike)
              const isATM = strike === atmStrike
              const callITM = call?.inTheMoney ?? false
              const putITM = put?.inTheMoney ?? false
              const hoverCall = hoveredStrike === strike && hoveredSide === 'call'
              const hoverPut = hoveredStrike === strike && hoveredSide === 'put'

              return (
                <tr key={strike}>
                  {/* Call cells */}
                  <td
                    style={{ ...td(), ...callRowStyle(callITM, hoverCall) }}
                    onClick={() => call && handleCallClick(call)}
                    onMouseEnter={() => { setHoveredStrike(strike); setHoveredSide('call') }}
                    onMouseLeave={() => { setHoveredStrike(null); setHoveredSide(null) }}
                  >
                    {call ? fmt(call.bid) : '—'}
                  </td>
                  <td
                    style={{ ...td(), ...callRowStyle(callITM, hoverCall) }}
                    onClick={() => call && handleCallClick(call)}
                    onMouseEnter={() => { setHoveredStrike(strike); setHoveredSide('call') }}
                    onMouseLeave={() => { setHoveredStrike(null); setHoveredSide(null) }}
                  >
                    {call ? fmt(call.ask) : '—'}
                  </td>
                  <td
                    style={{ ...td(), ...callRowStyle(callITM, hoverCall) }}
                    onClick={() => call && handleCallClick(call)}
                    onMouseEnter={() => { setHoveredStrike(strike); setHoveredSide('call') }}
                    onMouseLeave={() => { setHoveredStrike(null); setHoveredSide(null) }}
                  >
                    {call ? fmt(call.lastPrice) : '—'}
                  </td>
                  <td
                    style={{ ...td(), ...callRowStyle(callITM, hoverCall) }}
                    onClick={() => call && handleCallClick(call)}
                    onMouseEnter={() => { setHoveredStrike(strike); setHoveredSide('call') }}
                    onMouseLeave={() => { setHoveredStrike(null); setHoveredSide(null) }}
                  >
                    {call ? fmtVol(call.volume) : '—'}
                  </td>
                  <td
                    style={{ ...td(), ...callRowStyle(callITM, hoverCall) }}
                    onClick={() => call && handleCallClick(call)}
                    onMouseEnter={() => { setHoveredStrike(strike); setHoveredSide('call') }}
                    onMouseLeave={() => { setHoveredStrike(null); setHoveredSide(null) }}
                  >
                    {call ? fmtVol(call.openInterest) : '—'}
                  </td>
                  <td
                    style={{ ...td(), ...callRowStyle(callITM, hoverCall), color: call ? ivColor(call.impliedVolatility) : C.muted }}
                    onClick={() => call && handleCallClick(call)}
                    onMouseEnter={() => { setHoveredStrike(strike); setHoveredSide('call') }}
                    onMouseLeave={() => { setHoveredStrike(null); setHoveredSide(null) }}
                  >
                    {call ? `${(call.impliedVolatility * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td
                    style={{ ...td(), ...callRowStyle(callITM, hoverCall), color: '#22c55e' }}
                    onClick={() => call && handleCallClick(call)}
                    onMouseEnter={() => { setHoveredStrike(strike); setHoveredSide('call') }}
                    onMouseLeave={() => { setHoveredStrike(null); setHoveredSide(null) }}
                  >
                    {call ? fmt(call.delta, 3) : '—'}
                  </td>

                  {/* Strike cell */}
                  <td style={isATM ? styles.strikeITM : styles.strikeCell}>
                    {fmt(strike)}
                    {isATM && <span style={{ fontSize: '9px', color: '#7c6af7', display: 'block' }}>ATM</span>}
                  </td>

                  {/* Put cells */}
                  <td
                    style={{ ...td(), ...putRowStyle(putITM, hoverPut), color: '#ef4444' }}
                    onClick={() => put && handlePutClick(put)}
                    onMouseEnter={() => { setHoveredStrike(strike); setHoveredSide('put') }}
                    onMouseLeave={() => { setHoveredStrike(null); setHoveredSide(null) }}
                  >
                    {put ? fmt(put.delta, 3) : '—'}
                  </td>
                  <td
                    style={{ ...td(), ...putRowStyle(putITM, hoverPut), color: put ? ivColor(put.impliedVolatility) : C.muted }}
                    onClick={() => put && handlePutClick(put)}
                    onMouseEnter={() => { setHoveredStrike(strike); setHoveredSide('put') }}
                    onMouseLeave={() => { setHoveredStrike(null); setHoveredSide(null) }}
                  >
                    {put ? `${(put.impliedVolatility * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td
                    style={{ ...td(), ...putRowStyle(putITM, hoverPut) }}
                    onClick={() => put && handlePutClick(put)}
                    onMouseEnter={() => { setHoveredStrike(strike); setHoveredSide('put') }}
                    onMouseLeave={() => { setHoveredStrike(null); setHoveredSide(null) }}
                  >
                    {put ? fmtVol(put.openInterest) : '—'}
                  </td>
                  <td
                    style={{ ...td(), ...putRowStyle(putITM, hoverPut) }}
                    onClick={() => put && handlePutClick(put)}
                    onMouseEnter={() => { setHoveredStrike(strike); setHoveredSide('put') }}
                    onMouseLeave={() => { setHoveredStrike(null); setHoveredSide(null) }}
                  >
                    {put ? fmtVol(put.volume) : '—'}
                  </td>
                  <td
                    style={{ ...td(), ...putRowStyle(putITM, hoverPut) }}
                    onClick={() => put && handlePutClick(put)}
                    onMouseEnter={() => { setHoveredStrike(strike); setHoveredSide('put') }}
                    onMouseLeave={() => { setHoveredStrike(null); setHoveredSide(null) }}
                  >
                    {put ? fmt(put.lastPrice) : '—'}
                  </td>
                  <td
                    style={{ ...td(), ...putRowStyle(putITM, hoverPut) }}
                    onClick={() => put && handlePutClick(put)}
                    onMouseEnter={() => { setHoveredStrike(strike); setHoveredSide('put') }}
                    onMouseLeave={() => { setHoveredStrike(null); setHoveredSide(null) }}
                  >
                    {put ? fmt(put.ask) : '—'}
                  </td>
                  <td
                    style={{ ...td(), ...putRowStyle(putITM, hoverPut) }}
                    onClick={() => put && handlePutClick(put)}
                    onMouseEnter={() => { setHoveredStrike(strike); setHoveredSide('put') }}
                    onMouseLeave={() => { setHoveredStrike(null); setHoveredSide(null) }}
                  >
                    {put ? fmt(put.bid) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
