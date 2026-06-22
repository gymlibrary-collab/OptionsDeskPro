import { useState, useEffect, useRef, useCallback } from 'react'
import { scanWatchlist, getWatchlist, saveWatchlist, ScanResult, TradeStructure, WatchlistState } from '../api/client'
import StrategyDetail from './StrategyDetail'
import DailyBriefingCard from './DailyBriefingCard'
import { useEntitlements } from '../context/EntitlementsContext'

interface Props {
  onSelectTrade?: (symbol: string, trade: TradeStructure) => void
  onMethodologyClick?: () => void
}

const LS_KEY = 'optionsdesk_watchlist'
const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMZN', 'GLD', 'TLT']

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
  purple: '#a855f7',
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
      background: style.bg, color: style.color,
      border: `1px solid ${style.color}33`, borderRadius: '4px',
      padding: '2px 7px', fontSize: '11px', fontWeight: 700,
      display: 'inline-block', minWidth: '46px', textAlign: 'center',
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


type IVSource = 'volradar' | 'option_chain' | 'hv_proxy'
const IV_SOURCE_META: Record<IVSource, { dot: string; title: string }> = {
  volradar:     { dot: '#38bdf8', title: 'Primary source IVR' },
  option_chain: { dot: '#facc15', title: 'Secondary source IVR (ATM IV approx)' },
  hv_proxy:     { dot: '#9ca3af', title: 'Secondary source IVR (HV approx)' },
}

function IVRBar({ rank, source }: { rank: number; source?: IVSource }) {
  const pct = Math.max(0, Math.min(100, rank))
  const color = pct > 50 ? C.red : pct < 30 ? C.green : C.yellow
  const src = source && IV_SOURCE_META[source] ? IV_SOURCE_META[source] : IV_SOURCE_META.hv_proxy
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ background: C.surface2, borderRadius: '3px', height: '6px', width: '48px', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px' }} />
      </div>
      <span style={{ color, fontWeight: 700, fontSize: '12px', fontVariantNumeric: 'tabular-nums', minWidth: '28px' }}>
        {pct.toFixed(0)}
      </span>
      <span title={src.title} style={{ color: src.dot, fontSize: '8px', cursor: 'help' }}>⬤</span>
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    free:       { color: C.muted,   bg: C.surface2 },
    starter:    { color: C.blue,    bg: '#0d1a2d' },
    pro:        { color: C.purple,  bg: '#1a0d2d' },
    enterprise: { color: C.yellow,  bg: '#2d1f0f' },
  }
  const style = map[tier] || map.free
  return (
    <span style={{
      background: style.bg, color: style.color,
      border: `1px solid ${style.color}44`,
      borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>
      {tier}
    </span>
  )
}

function UsagePill({ used, max, label }: { used: number; max: number | null; label: string }) {
  const pct = max ? Math.min(100, (used / max) * 100) : 0
  const color = pct > 80 ? C.red : pct > 50 ? C.yellow : C.green
  const displayMax = max ?? '∞'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '100px' }}>
      <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {max !== null && (
          <div style={{ background: C.surface2, borderRadius: '3px', height: '4px', width: '48px', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.3s' }} />
          </div>
        )}
        <span style={{ fontSize: '11px', color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {used} / {displayMax}
        </span>
      </div>
    </div>
  )
}

function SymbolChip({ symbol, onRemove, disabled }: { symbol: string; onRemove: () => void; disabled?: boolean }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        background: hover ? `${C.accent}22` : C.surface2,
        border: `1px solid ${hover ? C.accent : C.border}`,
        borderRadius: '5px', padding: '3px 8px 3px 10px',
        fontSize: '12px', fontWeight: 700, color: C.text,
        transition: 'all 0.12s', userSelect: 'none',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {symbol}
      {!disabled && (
        <button
          onClick={onRemove}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: hover ? C.red : C.muted,
            padding: '0 0 0 2px', fontSize: '14px', lineHeight: 1,
            display: 'flex', alignItems: 'center',
            transition: 'color 0.12s',
          }}
          title={`Remove ${symbol}`}
        >
          ×
        </button>
      )}
    </div>
  )
}

function WatchlistEditor({
  symbols, onSymbolsChange, maxSymbols, disabled
}: {
  symbols: string[]
  onSymbolsChange: (syms: string[]) => void
  maxSymbols: number | null
  disabled?: boolean
}) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const atLimit = maxSymbols !== null && symbols.length >= maxSymbols

  const addSymbol = useCallback((raw: string) => {
    const parts = raw.toUpperCase().split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
    const toAdd = parts.filter(s => !symbols.includes(s) && (maxSymbols === null || symbols.length < maxSymbols))
    if (toAdd.length > 0) onSymbolsChange([...symbols, ...toAdd])
    setInput('')
  }, [symbols, onSymbolsChange, maxSymbols])

  const removeSymbol = useCallback((sym: string) => {
    onSymbolsChange(symbols.filter(s => s !== sym))
  }, [symbols, onSymbolsChange])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '32px', alignItems: 'center' }}>
        {symbols.map(sym => (
          <SymbolChip key={sym} symbol={sym} onRemove={() => removeSymbol(sym)} disabled={disabled} />
        ))}
        {!disabled && !atLimit && (
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => {
              if ((e.key === 'Enter' || e.key === ',' || e.key === ' ') && input.trim()) {
                e.preventDefault()
                addSymbol(input)
              } else if (e.key === 'Backspace' && !input && symbols.length > 0) {
                removeSymbol(symbols[symbols.length - 1])
              }
            }}
            onBlur={() => { if (input.trim()) addSymbol(input) }}
            placeholder={symbols.length === 0 ? 'Type a ticker and press Enter...' : 'Add symbol...'}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: C.text, fontSize: '12px', fontWeight: 700,
              minWidth: '120px', flex: 1, padding: '3px 0',
              letterSpacing: '0.04em',
            }}
          />
        )}
        {atLimit && (
          <span style={{ fontSize: '11px', color: C.yellow, fontStyle: 'italic' }}>
            Watchlist full — upgrade to add more symbols
          </span>
        )}
      </div>
    </div>
  )
}

export default function StrategyScanner({ onSelectTrade, onMethodologyClick }: Props) {
  const { entitlements } = useEntitlements()
  const briefingUnlocked = entitlements?.features?.morning_briefing ?? false
  const [symbols, setSymbols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(LS_KEY)
      return saved ? JSON.parse(saved) : DEFAULT_SYMBOLS
    } catch {
      return DEFAULT_SYMBOLS
    }
  })
  const [watchlistState, setWatchlistState] = useState<WatchlistState | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [briefingRevision, setBriefingRevision] = useState(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [results, setResults] = useState<ScanResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [scanned, setScanned] = useState(false)

  // Load from Supabase on mount, fall back to localStorage
  // If DB is empty but localStorage has symbols, push them to DB so the
  // morning briefing (which reads the DB) can see them.
  useEffect(() => {
    getWatchlist()
      .then(async state => {
        setWatchlistState(state)
        if (state.symbols.length > 0) {
          setSymbols(state.symbols)
          localStorage.setItem(LS_KEY, JSON.stringify(state.symbols))
        } else {
          // DB is empty — push whatever is in localStorage now
          const local: string[] = (() => {
            try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
          })()
          if (local.length > 0) {
            try {
              await saveWatchlist(local)
              const refreshed = await getWatchlist()
              setWatchlistState(refreshed)
              setBriefingRevision(r => r + 1)
            } catch { /* best-effort */ }
          }
        }
      })
      .catch(() => { /* stay with localStorage */ })
  }, [])

  // Debounced save to localStorage + Supabase on symbols change
  const handleSymbolsChange = useCallback((newSymbols: string[]) => {
    setSymbols(newSymbols)
    localStorage.setItem(LS_KEY, JSON.stringify(newSymbols))

    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSyncStatus('saving')
    saveTimer.current = setTimeout(async () => {
      try {
        await saveWatchlist(newSymbols)
        // Refresh watchlist state (updates scan usage counts)
        const state = await getWatchlist()
        setWatchlistState(state)
        setSyncStatus('saved')
        setBriefingRevision(r => r + 1)
        setTimeout(() => setSyncStatus('idle'), 2000)
      } catch {
        setSyncStatus('error')
        setTimeout(() => setSyncStatus('idle'), 3000)
      }
    }, 800)
  }, [])

  const maxSymbols = watchlistState?.max_symbols ?? null
  const scansUsed = watchlistState?.scans_used ?? 0
  const maxScans = watchlistState?.max_scans_per_month ?? null
  const tier = watchlistState?.tier ?? 'free'
  const scanLimitReached = maxScans !== null && scansUsed >= maxScans

  const handleScan = async () => {
    if (!symbols.length || loading || scanLimitReached) return
    setLoading(true)
    setError(null)
    setSelectedSymbol(null)
    setScanned(false)
    try {
      const data = await scanWatchlist(symbols.join(','))
      setResults(data)
      setScanned(true)
      // Refresh usage count
      getWatchlist().then(setWatchlistState).catch(() => {})
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      if (detail?.error === 'scan_limit_reached') {
        setError(`Monthly scan limit reached (${detail.used}/${detail.limit} on ${detail.tier} plan). Upgrade to scan more.`)
      } else {
        setError(detail?.message || detail || e?.message || 'Scan failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '100%' }}>
      {/* E4 — Daily Morning Briefing */}
      <DailyBriefingCard unlocked={briefingUnlocked} watchlistRevision={briefingRevision} />

      {/* Watchlist editor card */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            Watchlist
          </span>
          {watchlistState && <TierBadge tier={tier} />}
          <button
            onClick={() => onMethodologyClick?.()}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: '#7c6af7', fontSize: '11px', fontWeight: 600,
              cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px',
              whiteSpace: 'nowrap' as const,
            }}
          >
            Learn how strategies are selected →
          </button>
          <div style={{ display: 'flex', gap: '16px', marginLeft: 'auto', flexWrap: 'wrap' }}>
            {watchlistState && (
              <>
                <UsagePill
                  used={symbols.length}
                  max={maxSymbols}
                  label="Symbols"
                />
                <UsagePill
                  used={scansUsed}
                  max={maxScans}
                  label="Scans / month"
                />
              </>
            )}
            <div style={{ fontSize: '10px', color: syncStatus === 'saved' ? C.green : syncStatus === 'error' ? C.red : syncStatus === 'saving' ? C.yellow : 'transparent', alignSelf: 'flex-end', paddingBottom: '2px' }}>
              {syncStatus === 'saving' ? '↑ saving...' : syncStatus === 'saved' ? '✓ saved' : syncStatus === 'error' ? '! save failed' : '·'}
            </div>
          </div>
        </div>

        {/* Chip editor */}
        <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '8px 10px', minHeight: '44px' }}>
          <WatchlistEditor
            symbols={symbols}
            onSymbolsChange={handleSymbolsChange}
            maxSymbols={maxSymbols}
            disabled={loading}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: C.muted }}>
            Type a ticker + Enter to add. Press Backspace to remove the last one.
          </span>
          <button
            onClick={handleScan}
            disabled={loading || !symbols.length || scanLimitReached}
            style={{
              marginLeft: 'auto',
              background: loading || scanLimitReached ? C.surface2 : C.accent,
              border: 'none', borderRadius: '6px',
              color: loading || scanLimitReached ? C.muted : '#fff',
              padding: '9px 28px', fontSize: '13px', fontWeight: 700,
              cursor: loading || scanLimitReached ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap', letterSpacing: '0.04em',
              transition: 'background 0.15s',
            }}
          >
            {loading ? `Scanning ${symbols.length} symbols...` : scanLimitReached ? 'Scan limit reached' : 'Scan Watchlist'}
          </button>
        </div>

        {scanLimitReached && (
          <div style={{ padding: '8px 12px', background: '#2d1f0f', border: `1px solid ${C.yellow}44`, borderRadius: '6px', fontSize: '12px', color: C.yellow }}>
            You've used all {maxScans} scans for this month on the <strong>{tier}</strong> plan. Upgrade to continue scanning.
          </div>
        )}
      </div>

      {loading && (
        <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', padding: '24px' }}>
          Scanning {symbols.length} symbols — computing IV rank and directional bias...
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', color: C.red, background: '#2d0f0f', borderRadius: '8px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Results Table */}
      {scanned && results.length > 0 && !selectedSymbol && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '60vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: C.surface2 }}>
                  {['Symbol', 'Price', 'IVR', 'IV Env', 'Bias', 'Strategies Available', 'Condition Matches', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: C.muted, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', background: C.surface2 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr
                    key={r.symbol}
                    style={{ borderBottom: i < results.length - 1 ? `1px solid ${C.border}22` : 'none', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.surface2)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: C.text }}>
                      {r.symbol}
                      {r.error && <span title={r.error} style={{ marginLeft: '6px', color: C.red, fontSize: '10px' }}>!</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: C.text, fontVariantNumeric: 'tabular-nums' }}>${fmt(r.price)}</td>
                    <td style={{ padding: '10px 14px' }}><IVRBar rank={r.iv_rank} source={r.iv_source as IVSource} /></td>
                    <td style={{ padding: '10px 14px' }}><IVEnvBadge env={r.iv_environment} /></td>
                    <td style={{ padding: '10px 14px' }}><BiasBadge bias={r.bias} /></td>
                    <td style={{ padding: '10px 14px', color: C.text, fontVariantNumeric: 'tabular-nums', fontSize: '12px' }}>
                      {r.strategy_count != null ? `${r.strategy_count} strategies` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums', fontSize: '12px' }}>
                      {r.condition_matches != null ? (
                        <span style={{ color: r.condition_matches > 0 ? C.green : C.muted, fontWeight: 600 }}>
                          {r.condition_matches} match{r.condition_matches !== 1 ? 'es' : ''}
                        </span>
                      ) : (
                        <span style={{ color: C.muted }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <button
                        onClick={() => setSelectedSymbol(r.symbol)}
                        style={{ background: 'transparent', border: `1px solid ${C.accent}`, color: C.accent, borderRadius: '5px', padding: '4px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.1s' }}
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
              style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.muted, borderRadius: '5px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
            >
              ← Back to scan
            </button>
            <span style={{ color: C.muted, fontSize: '13px' }}>
              Deep analysis: <span style={{ color: C.text, fontWeight: 700 }}>{selectedSymbol}</span>
            </span>
          </div>
          <StrategyDetail symbol={selectedSymbol} onSelectTrade={onSelectTrade} />
        </div>
      )}

      {/* Educational disclaimer */}
      <div style={{
        marginTop: '24px',
        padding: '10px 16px',
        background: C.surface2,
        border: `1px solid ${C.border}`,
        borderRadius: '8px',
        textAlign: 'center',
        fontSize: '12px',
        color: C.muted,
      }}>
        For educational purposes only — not financial advice. All analysis is simulated and does not constitute a recommendation to trade.
      </div>
    </div>
  )
}
