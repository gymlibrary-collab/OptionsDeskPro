import { useEffect, useState, useCallback } from 'react'
import { getMorningBriefing, refreshMorningBriefing, MorningBriefingResponse } from '../api/client'
import { useWindowSize } from '../hooks/useWindowSize'

const C = {
  surface: '#1a1d27',
  surface2: '#252836',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#64748b',
  accent: '#7c6af7',
  green: '#22c55e',
  yellow: '#f59e0b',
  red: '#ef4444',
}

function fmt(date: string): string {
  try {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return date
  }
}

export default function DailyBriefingCard({ unlocked = true, watchlistRevision = 0 }: { unlocked?: boolean; watchlistRevision?: number }) {
  const { isMobile } = useWindowSize()
  const [data, setData] = useState<MorningBriefingResponse | null>(null)
  const [loading, setLoading] = useState(unlocked)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Collapsed by default on mobile, expanded on desktop
  const [expanded, setExpanded] = useState(!isMobile)

  const load = useCallback((fetcher: () => Promise<MorningBriefingResponse>) => {
    setError(null)
    fetcher()
      .then(setData)
      .catch(e => {
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        setError(typeof detail === 'string' ? detail : 'Could not load morning briefing.')
      })
      .finally(() => { setLoading(false); setRefreshing(false) })
  }, [])

  useEffect(() => {
    if (!unlocked) return
    load(getMorningBriefing)
  }, [unlocked, load])

  // Auto-refresh when watchlist is saved (watchlistRevision increments)
  useEffect(() => {
    if (!unlocked || watchlistRevision === 0) return
    setRefreshing(true)
    load(refreshMorningBriefing)
  }, [watchlistRevision, unlocked, load])

  const handleRefresh = () => {
    if (refreshing) return
    setRefreshing(true)
    load(refreshMorningBriefing)
  }

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.accent}44`,
      borderRadius: '10px',
      overflow: 'hidden',
      marginBottom: '4px',
    }}>
      {/* Header — always visible, click to expand/collapse */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '16px', flexShrink: 0 }}>☀</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>
            Morning Briefing
            {data?.cached && (
              <span style={{ marginLeft: '8px', fontSize: '10px', color: C.muted, fontWeight: 400 }}>cached</span>
            )}
          </div>
          {data && (
            <div style={{ fontSize: '11px', color: C.muted, marginTop: '1px' }}>
              {fmt(data.date)}
              {data.symbols.length > 0 && (
                <span> · {data.symbols.slice(0, 5).join(', ')}{data.symbols.length > 5 ? ` +${data.symbols.length - 5} more` : ''}</span>
              )}
            </div>
          )}
          {loading && (
            <div style={{ fontSize: '11px', color: C.muted, marginTop: '1px' }}>Loading briefing…</div>
          )}
        </div>
        <span style={{ color: C.muted, fontSize: '14px', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
        {unlocked && !loading && (
          <button
            onClick={e => { e.stopPropagation(); handleRefresh() }}
            disabled={refreshing}
            title="Regenerate briefing"
            style={{
              background: 'transparent',
              border: `1px solid ${C.border}`,
              borderRadius: '5px',
              color: refreshing ? C.muted : C.accent,
              padding: '3px 8px',
              fontSize: '11px',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              fontFamily: 'inherit',
            }}
          >
            {refreshing ? '…' : '↺'}
          </button>
        )}
      </button>

      {/* Body */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '14px 16px' }}>
          {!unlocked && (
            <div style={{ fontSize: '13px', color: C.muted, textAlign: 'center', padding: '8px 0' }}>
              🔒 Upgrade to Pro to unlock your Daily Morning Briefing.
            </div>
          )}
          {unlocked && (loading || refreshing) && (
            <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>
              {refreshing ? 'Regenerating your morning briefing…' : 'Generating your morning briefing…'}
            </div>
          )}

          {unlocked && !loading && error && (
            <div style={{
              background: '#2d0f0f',
              border: `1px solid ${C.red}44`,
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '13px',
              color: C.red,
            }}>
              {error}
            </div>
          )}

          {unlocked && !loading && !error && data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Briefing text */}
              <div style={{
                fontSize: '13px',
                color: C.text,
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
              }}>
                {data.briefing}
              </div>

              {/* Symbols covered */}
              {data.symbols.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: C.muted, flexShrink: 0 }}>Covers:</span>
                  {data.symbols.map(sym => (
                    <span
                      key={sym}
                      style={{
                        background: `${C.accent}18`,
                        border: `1px solid ${C.accent}33`,
                        borderRadius: '4px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: C.accent,
                      }}
                    >
                      {sym}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
