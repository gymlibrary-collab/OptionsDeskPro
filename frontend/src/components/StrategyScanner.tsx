import { useState } from 'react'
import { scanWatchlist, ScanResult } from '../api/client'
import StrategyDetail from './StrategyDetail'
import { OrderPrefill } from '../App'

interface Props {
  onAddToOrder?: (prefill: OrderPrefill) => void
}

const DEFAULT_SYMBOLS = 'SPY,QQQ,AAPL,TSLA,NVDA,AMZN,GLD,TLT'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  surface2: '#252836',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#64748b',
  accent: '#7c6af7',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#f59e0b',
  blue: '#3b82f6',
}

function fmt(n: number | null | undefined, d = 2): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function IVEnvBadge({ env }: { env: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    HIGH: { bg: '#2d0f0f', color: C.red },
    MEDIUM: { bg: '#2d1f0f', color: C.yellow },
    LOW: { bg: '#0f2d1a', color: C.green },
  }
  const style = map[env] || { bg: C.surface2, color: C.muted }
  return (
    <span style={{
      background: style.bg,
      color: style.color,
      border: `1px solid ${style.color}33`,
      borderRadius: '4px',
      padding: '2px 7px',
      fontSize: '11px',
      fontWeight: 700,
      display: 'inline-block',
      minWidth: '46px',
      textAlign: 'center',
    }}>
      {env === 'MEDIUM' ? 'MED' : env}
    </span>
  )
}

function BiasBadge({ bias }: { bias: string }) {
  const isBull = bias.includes('BULLISH')
  const isBear = bias.includes('BEARISH')
  const color = isBull ? C.green : isBear ? C.red : C.yellow
  const arrow = isBull ? '▲' : isBear ? '▼' : '◆'
  const short = bias === 'NEUTRAL_BULLISH' ? 'N-BULL' : bias === 'NEUTRAL_BEARISH' ? 'N-BEAR' : bias
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color, fontSize: '12px', fontWeight: 600 }}>
      {arrow} {short}
    </span>
  )
}

function RiskBadge({ type }: { type: string }) {
  if (!type) return null
  const isDefined = type === 'DEFINED'
  return (
    <span style={{
      background: isDefined ? '#0d1a2d' : '#2d1a0d',
      color: isDefined ? C.blue : C.yellow,
      border: `1px solid ${isDefined ? C.blue : C.yellow}44`,
      borderRadius: '4px',
      padding: '2px 6px',
      fontSize: '10px',
      fontWeight: 700,
    }}>
      {type}
    </span>
  )
}

function IVRBar({ rank }: { rank: number }) {
  const pct = Math.max(0, Math.min(100, rank))
  const color = pct > 50 ? C.red : pct < 30 ? C.green : C.yellow
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ background: C.surface2, borderRadius: '3px', height: '6px', width: '48px', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px' }} />
      </div>
      <span style={{ color, fontWeight: 700, fontSize: '12px', fontVariantNumeric: 'tabular-nums', minWidth: '28px' }}>
        {pct.toFixed(0)}
      </span>
    </div>
  )
}

export default function StrategyScanner({ onAddToOrder }: Props) {
  const [symbolsInput, setSymbolsInput] = useState(DEFAULT_SYMBOLS)
  const [results, setResults] = useState<ScanResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [scanned, setScanned] = useState(false)

  const handleScan = async () => {
    const syms = symbolsInput.trim()
    if (!syms) return
    setLoading(true)
    setError(null)
    setSelectedSymbol(null)
    setScanned(false)
    try {
      const data = await scanWatchlist(syms)
      setResults(data)
      setScanned(true)
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Scan failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '100%' }}>
      {/* Controls */}
      <div style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '8px',
        padding: '14px 16px',
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '4px' }}>
            Watchlist (comma-separated)
          </label>
          <input
            value={symbolsInput}
            onChange={e => setSymbolsInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleScan()}
            style={{
              background: C.surface2,
              border: `1px solid #3a3f5c`,
              borderRadius: '6px',
              color: C.text,
              padding: '7px 10px',
              fontSize: '13px',
              outline: 'none',
              width: '100%',
            }}
            placeholder="SPY,QQQ,AAPL,..."
          />
        </div>
        <button
          onClick={handleScan}
          disabled={loading}
          style={{
            background: loading ? C.surface2 : C.accent,
            border: 'none',
            borderRadius: '6px',
            color: loading ? C.muted : '#fff',
            padding: '10px 24px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            alignSelf: 'flex-end',
            letterSpacing: '0.04em',
          }}
        >
          {loading ? 'Scanning...' : 'Scan'}
        </button>
      </div>

      {loading && (
        <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', padding: '24px' }}>
          Scanning {symbolsInput.split(',').length} symbols — computing IV rank and directional bias...
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', color: C.red, background: '#2d0f0f', borderRadius: '8px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Results Table */}
      {scanned && results.length > 0 && !selectedSymbol && (
        <div style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: C.surface2 }}>
                  {['Symbol', 'Price', 'IVR', 'IV Env', 'Bias', 'Top Strategy', 'PoP', 'Risk', ''].map(h => (
                    <th key={h} style={{
                      textAlign: 'left',
                      padding: '10px 14px',
                      color: C.muted,
                      fontWeight: 600,
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      borderBottom: `1px solid ${C.border}`,
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr
                    key={r.symbol}
                    style={{
                      borderBottom: i < results.length - 1 ? `1px solid ${C.border}22` : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.surface2)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: C.text }}>
                      {r.symbol}
                      {r.error && (
                        <span title={r.error} style={{ marginLeft: '6px', color: C.red, fontSize: '10px' }}>!</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                      ${fmt(r.price)}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <IVRBar rank={r.iv_rank} />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <IVEnvBadge env={r.iv_environment} />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <BiasBadge bias={r.bias} />
                    </td>
                    <td style={{ padding: '10px 14px', color: C.text, maxWidth: '260px' }}>
                      {r.top_strategy ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600 }}>{r.top_strategy.name}</span>
                          {r.scan_narrative?.headline && (
                            <span style={{ fontSize: '11px', color: C.muted, lineHeight: 1.4 }}>
                              {r.scan_narrative.headline}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: C.muted, fontSize: '12px' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: C.accent, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {r.top_strategy
                        ? `${r.top_strategy.pop_range[0]}–${r.top_strategy.pop_range[1]}%`
                        : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {r.top_strategy && <RiskBadge type={r.top_strategy.risk_type} />}
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <button
                        onClick={() => setSelectedSymbol(r.symbol)}
                        style={{
                          background: 'transparent',
                          border: `1px solid ${C.accent}`,
                          color: C.accent,
                          borderRadius: '5px',
                          padding: '4px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}22`)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        Analyze
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 14px', fontSize: '11px', color: C.muted, borderTop: `1px solid ${C.border}` }}>
            {results.length} symbols sorted by IVR (highest opportunity first)
          </div>
        </div>
      )}

      {scanned && results.length === 0 && !loading && (
        <div style={{ color: C.muted, textAlign: 'center', padding: '24px' }}>No results.</div>
      )}

      {/* Detail view */}
      {selectedSymbol && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <button
              onClick={() => setSelectedSymbol(null)}
              style={{
                background: C.surface2,
                border: `1px solid ${C.border}`,
                color: C.muted,
                borderRadius: '5px',
                padding: '5px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              ← Back to scan
            </button>
            <span style={{ color: C.muted, fontSize: '13px' }}>
              Deep analysis: <span style={{ color: C.text, fontWeight: 700 }}>{selectedSymbol}</span>
            </span>
          </div>
          <StrategyDetail symbol={selectedSymbol} onAddToOrder={onAddToOrder} />
        </div>
      )}
    </div>
  )
}
