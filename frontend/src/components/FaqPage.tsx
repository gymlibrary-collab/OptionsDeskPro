import { useEffect, useState } from 'react'
import { FaqCategory, getPublicFaq } from '../api/client'
import { useWindowSize } from '../hooks/useWindowSize'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
  error: '#ef4444',
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

interface Props {
  onClose?: () => void
}

export default function FaqPage({ onClose }: Props) {
  const { isMobile } = useWindowSize()
  const [categories, setCategories] = useState<FaqCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getPublicFaq()
      .then(data => setCategories(data.categories))
      .catch(() => setError('Unable to load FAQ. Please try again.'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id: string) => setExpanded(prev => prev === id ? null : id)

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px', background: C.bg, fontFamily: FONT }}>
        <span style={{ color: C.muted, fontSize: '14px' }}>Loading FAQ...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '40px', background: C.bg, textAlign: 'center', fontFamily: FONT }}>
        <div style={{ color: C.error, fontSize: '14px', marginBottom: '16px' }}>{error}</div>
        <button
          onClick={() => window.location.reload()}
          style={{ background: C.accent, border: 'none', borderRadius: '8px', color: '#fff', padding: '8px 20px', cursor: 'pointer', fontFamily: FONT }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, padding: isMobile ? '20px 12px' : '40px 24px', minHeight: '100vh', fontFamily: FONT }}>
      {onClose && (
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '6px', color: C.muted, padding: '6px 14px', fontSize: '13px', cursor: 'pointer', marginBottom: '24px', fontFamily: FONT }}
        >
          Back
        </button>
      )}

      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: isMobile ? '22px' : '28px', fontWeight: 700, color: C.text }}>
          Frequently Asked Questions
        </h1>
        <p style={{ margin: '0 0 32px', color: C.muted, fontSize: '14px' }}>
          Find answers to common questions about OptionsDesk.
        </p>

        {categories.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '40px', textAlign: 'center', color: C.muted, fontSize: '14px' }}>
            No FAQ articles available yet.
          </div>
        ) : (
          categories.map(cat => (
            <div key={cat.id} style={{ marginBottom: '28px' }}>
              <h2 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {cat.title}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {cat.articles.map(article => (
                  <div
                    key={article.id}
                    style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden' }}
                  >
                    <button
                      onClick={() => toggle(article.id)}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        padding: '14px 16px',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        gap: '12px',
                      }}
                    >
                      <span style={{ fontSize: '14px', fontWeight: 600, color: C.text, fontFamily: FONT }}>
                        {article.question}
                      </span>
                      <span style={{ color: C.muted, fontSize: '18px', flexShrink: 0, lineHeight: 1 }}>
                        {expanded === article.id ? '-' : '+'}
                      </span>
                    </button>
                    {expanded === article.id && (
                      <div style={{ padding: '0 16px 14px', borderTop: `1px solid ${C.border}`, paddingTop: '14px' }}>
                        <p style={{ margin: 0, fontSize: '13px', color: C.muted, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          {article.answer_markdown}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
