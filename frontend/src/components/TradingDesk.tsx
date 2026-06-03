import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  RedditPost,
  getEarningsBuzz, getStocksBuzz, getCryptoBuzz,
  getTokensBuzz, getSelectedBuzz,
} from '../api/client'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
  green: '#22c55e',
  input: '#252836',
}

function relTime(utc: number): string {
  const diff = Math.floor(Date.now() / 1000 - utc)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function fmtScore(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function PostRow({ post }: { post: RedditPost }) {
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block',
        padding: '10px 12px',
        borderBottom: `1px solid ${C.border}`,
        textDecoration: 'none',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#22263a')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ fontSize: '12px', color: C.text, lineHeight: '1.4', marginBottom: '5px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {post.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {post.subreddit && (
          <span style={{ fontSize: '10px', background: '#2d3148', color: C.accent, padding: '1px 6px', borderRadius: '10px', fontWeight: 600 }}>
            {post.subreddit}
          </span>
        )}
        {post.flair && (
          <span style={{ fontSize: '10px', color: C.muted, background: '#1e2235', padding: '1px 6px', borderRadius: '10px' }}>
            {post.flair}
          </span>
        )}
        {post.score > 0 && (
          <span style={{ fontSize: '10px', color: C.green, marginLeft: 'auto' }}>▲ {fmtScore(post.score)}</span>
        )}
        {post.num_comments > 0 && (
          <span style={{ fontSize: '10px', color: C.muted, marginLeft: post.score > 0 ? undefined : 'auto' }}>💬 {fmtScore(post.num_comments)}</span>
        )}
        <span style={{ fontSize: '10px', color: C.muted }}>{relTime(post.created_utc)}</span>
      </div>
    </a>
  )
}

interface BuzzPanelProps {
  title: string
  fetchFn: () => Promise<RedditPost[]>
  refreshInterval: number
  headerExtra?: React.ReactNode
}

function BuzzPanel({ title, fetchFn, refreshInterval, headerExtra }: BuzzPanelProps) {
  const [posts, setPosts] = useState<RedditPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchFn()
      setPosts(data)
      setLastUpdated(new Date())
      setError('')
    } catch {
      setError('Failed to load')
    } finally {
      setLoading(false)
    }
  }, [fetchFn])

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, refreshInterval)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [load, refreshInterval])

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div style={{ width: '3px', height: '16px', background: C.accent, borderRadius: '2px', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: '12px', color: C.text, flex: 1 }}>{title}</span>
        {headerExtra}
        {lastUpdated && (
          <span style={{ fontSize: '10px', color: C.muted }}>
            {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <button
          onClick={() => { setLoading(true); load() }}
          title="Refresh"
          style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '13px', padding: '0 2px', lineHeight: 1 }}
        >↻</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '32px' }}>
            <span style={{ color: C.muted, fontSize: '12px' }}>Loading…</span>
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: '24px', textAlign: 'center', color: '#f87171', fontSize: '12px' }}>{error}</div>
        )}
        {!loading && !error && posts.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: C.muted, fontSize: '12px' }}>No posts found</div>
        )}
        {!loading && !error && posts.map((p, i) => <PostRow key={i} post={p} />)}
      </div>
    </div>
  )
}

function SelectedStocksPanel() {
  const [watchlist, setWatchlist] = useState('SPY,AAPL,NVDA,TSLA,MSFT')
  const [input, setInput] = useState('SPY,AAPL,NVDA,TSLA,MSFT')
  const fetchFn = useCallback(() => getSelectedBuzz(watchlist), [watchlist])

  const apply = () => {
    const cleaned = input.toUpperCase().split(',').map(s => s.trim()).filter(Boolean).join(',')
    setInput(cleaned)
    setWatchlist(cleaned)
  }

  return (
    <BuzzPanel
      title="Buzz about Selected Stocks"
      fetchFn={fetchFn}
      refreshInterval={300_000}
      headerExtra={
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && apply()}
            placeholder="SPY,AAPL,NVDA"
            style={{ background: C.input, border: `1px solid #3a3f5c`, borderRadius: '4px', color: C.text, padding: '3px 7px', fontSize: '11px', width: '160px', outline: 'none', textTransform: 'uppercase' }}
          />
          <button
            onClick={apply}
            style={{ background: C.accent, border: 'none', borderRadius: '4px', color: '#fff', padding: '3px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
          >Go</button>
        </div>
      }
    />
  )
}

// ── Resizable panel wrapper ────────────────────────────────────────────────

type PanelId = 'earnings' | 'stocks' | 'crypto' | 'selected' | 'tokens'

interface PanelSize { colSpan: number; height: number }

const DEFAULTS: Record<PanelId, PanelSize> = {
  earnings: { colSpan: 2, height: 420 },
  stocks:   { colSpan: 2, height: 420 },
  crypto:   { colSpan: 2, height: 420 },
  selected: { colSpan: 3, height: 420 },
  tokens:   { colSpan: 3, height: 420 },
}

const STORAGE_KEY = 'tradingDeskSizes'

function loadSizes(): Record<PanelId, PanelSize> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULTS }
}

interface ResizablePanelProps {
  size: PanelSize
  onResize: (h: number) => void
  onColSpan: (s: number) => void
  children: React.ReactNode
}

function ResizablePanel({ size, onResize, onColSpan, children }: ResizablePanelProps) {
  const startY = useRef(0)
  const startH = useRef(0)
  const handleRef = useRef<HTMLDivElement>(null)

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    startY.current = e.clientY
    startH.current = size.height

    const onMove = (me: MouseEvent) => {
      const next = Math.max(180, startH.current + me.clientY - startY.current)
      onResize(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (handleRef.current) handleRef.current.style.borderTopColor = C.border
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    background: 'transparent',
    border: `1px solid ${disabled ? '#3a3f5c44' : '#3a3f5c'}`,
    borderRadius: '3px',
    color: disabled ? C.border : C.muted,
    fontSize: '11px',
    padding: '1px 5px',
    cursor: disabled ? 'default' : 'pointer',
    lineHeight: 1.4,
    fontWeight: 700,
  })

  return (
    <div style={{ gridColumn: `span ${size.colSpan}`, display: 'flex', flexDirection: 'column', userSelect: 'none' }}>
      {/* Width control strip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginBottom: '4px', height: '20px' }}>
        <span style={{ fontSize: '10px', color: C.muted, marginRight: '2px' }}>width</span>
        <button
          style={btnStyle(size.colSpan <= 1)}
          disabled={size.colSpan <= 1}
          onClick={() => onColSpan(Math.max(1, size.colSpan - 1))}
          title="Narrower"
        >◂</button>
        <span style={{ fontSize: '10px', color: C.muted, minWidth: '22px', textAlign: 'center' }}>{size.colSpan}/6</span>
        <button
          style={btnStyle(size.colSpan >= 6)}
          disabled={size.colSpan >= 6}
          onClick={() => onColSpan(Math.min(6, size.colSpan + 1))}
          title="Wider"
        >▸</button>
      </div>

      {/* Panel content at fixed height */}
      <div style={{ height: `${size.height}px`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>

      {/* Height drag handle */}
      <div
        ref={handleRef}
        onMouseDown={startDrag}
        onMouseEnter={() => { if (handleRef.current) handleRef.current.style.borderTopColor = C.accent }}
        onMouseLeave={() => { if (handleRef.current) handleRef.current.style.borderTopColor = C.border }}
        title="Drag to resize height"
        style={{
          height: '8px',
          cursor: 'ns-resize',
          borderTop: `2px solid ${C.border}`,
          borderRadius: '0 0 4px 4px',
          transition: 'border-color 0.15s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '6px',
        }}
      >
        <div style={{ width: '24px', height: '2px', background: C.border, borderRadius: '1px', marginTop: '2px' }} />
      </div>
    </div>
  )
}

// ── TradingDesk ────────────────────────────────────────────────────────

export default function TradingDesk() {
  const [sizes, setSizes] = useState<Record<PanelId, PanelSize>>(loadSizes)

  const updateSize = (id: PanelId, patch: Partial<PanelSize>) => {
    setSizes(prev => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const resetLayout = () => {
    setSizes({ ...DEFAULTS })
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

  const panels: { id: PanelId; el: React.ReactNode }[] = [
    { id: 'earnings', el: <BuzzPanel title="Results Reporting"        fetchFn={getEarningsBuzz} refreshInterval={300_000} /> },
    { id: 'stocks',   el: <BuzzPanel title="Buzz about Stocks"        fetchFn={getStocksBuzz}   refreshInterval={300_000} /> },
    { id: 'crypto',   el: <BuzzPanel title="Buzz about Crypto"        fetchFn={getCryptoBuzz}   refreshInterval={180_000} /> },
    { id: 'selected', el: <SelectedStocksPanel /> },
    { id: 'tokens',   el: <BuzzPanel title="Buzz about New Tokens"    fetchFn={getTokensBuzz}   refreshInterval={600_000} /> },
  ]

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', color: C.muted, marginRight: '10px' }}>
          Drag bottom edge to resize height · use ◂ ▸ to adjust width
        </span>
        <button
          onClick={resetLayout}
          style={{
            background: 'transparent',
            border: `1px solid #3a3f5c`,
            borderRadius: '6px',
            color: C.muted,
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#3a3f5c'; e.currentTarget.style.color = C.muted }}
        >
          ↺ Reset Layout
        </button>
      </div>

      {/* Panel grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '14px', alignItems: 'start' }}>
        {panels.map(({ id, el }) => (
          <ResizablePanel
            key={id}
            size={sizes[id]}
            onResize={h => updateSize(id, { height: h })}
            onColSpan={s => updateSize(id, { colSpan: s })}
          >
            {el}
          </ResizablePanel>
        ))}
      </div>
    </div>
  )
}
