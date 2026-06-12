import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { FaqCategory, getPublicFaq } from '../api/client'
import { useWindowSize } from '../hooks/useWindowSize'

// ─── Minimal safe markdown renderer ─────────────────────────────────────────────────────────────
// Supports: **bold**, *italic*, [link](url), unordered lists (- item), paragraphs.
// Does NOT use dangerouslySetInnerHTML on raw user input.

function renderInline(text: string): ReactNode[] {
  // Pattern matches **bold**, *italic*, [link](url) in order
  const parts: ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Try **bold**
    const boldMatch = remaining.match(/^([\s\S]*?)\*\*([\s\S]+?)\*\*/)
    // Try *italic* (single asterisk, not double)
    const italicMatch = remaining.match(/^([\s\S]*?)(?<!\*)\*(?!\*)([\s\S]+?)(?<!\*)\*(?!\*)/)
    // Try [link](url)
    const linkMatch = remaining.match(/^([\s\S]*?)\[([^\]]+)\]\(([^)]+)\)/)

    // Find earliest match
    const candidates: Array<{ index: number; match: RegExpMatchArray; type: string }> = []
    if (boldMatch) candidates.push({ index: boldMatch[1].length, match: boldMatch, type: 'bold' })
    if (italicMatch) candidates.push({ index: italicMatch[1].length, match: italicMatch, type: 'italic' })
    if (linkMatch) candidates.push({ index: linkMatch[1].length, match: linkMatch, type: 'link' })

    if (candidates.length === 0) {
      parts.push(<span key={key++}>{remaining}</span>)
      break
    }

    candidates.sort((a, b) => a.index - b.index)
    const first = candidates[0]

    // Add text before match
    if (first.match[1]) {
      parts.push(<span key={key++}>{first.match[1]}</span>)
    }

    if (first.type === 'bold') {
      parts.push(<strong key={key++}>{first.match[2]}</strong>)
      remaining = remaining.slice(first.match[1].length + first.match[2].length + 4)
    } else if (first.type === 'italic') {
      parts.push(<em key={key++}>{first.match[3]}</em>)
      remaining = remaining.slice(first.match[1].length + first.match[3].length + 2)
    } else if (first.type === 'link') {
      const href = first.match[3]
      // Validate href to only allow http/https/mailto
      const safeHref = /^(https?:|mailto:)/i.test(href) ? href : '#'
      parts.push(
        <a key={key++} href={safeHref} target="_blank" rel="noopener noreferrer" style={{ color: '#7c6af7', textDecoration: 'underline' }}>
          {first.match[2]}
        </a>
      )
      remaining = remaining.slice(first.match[1].length + first.match[2].length + first.match[3].length + 4)
    }
  }

  return parts
}

function MarkdownContent({ markdown, style }: { markdown: string; style?: React.CSSProperties }) {
  const lines = markdown.split('\n')
  const elements: ReactNode[] = []
  let listItems: string[] = []
  let key = 0

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} style={{ margin: '6px 0', paddingLeft: '20px' }}>
          {listItems.map((item, i) => (
            <li key={i} style={{ marginBottom: '2px' }}>{renderInline(item)}</li>
          ))}
        </ul>
      )
      listItems = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const listItemMatch = line.match(/^[-*]\s+(.+)$/)
    if (listItemMatch) {
      listItems.push(listItemMatch[1])
    } else {
      flushList()
      const trimmed = line.trim()
      if (trimmed === '') {
        // paragraph break — skip blank lines (handled by gap)
      } else {
        elements.push(
          <p key={key++} style={{ margin: '0 0 6px' }}>{renderInline(trimmed)}</p>
        )
      }
    }
  }
  flushList()

  return (
    <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.7, ...style }}>
      {elements}
    </div>
  )
}

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
                      <div style={{ padding: '14px 16px 14px', borderTop: `1px solid ${C.border}` }}>
                        <MarkdownContent markdown={article.answer_markdown} />
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
