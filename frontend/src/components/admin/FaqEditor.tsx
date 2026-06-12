import { useEffect, useState, useCallback } from 'react'
import {
  getPlatformFaq,
  createFaqArticle,
  updateFaqArticle,
  publishFaqArticle,
  deleteFaqArticle,
  FaqCategory,
  FaqArticle,
} from '../../api/client'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
  input: '#252836',
  error: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

interface EditingArticle {
  id: string | null
  category_id: string | null
  question: string
  answer_markdown: string
  sort_order: string
}

const BLANK_ARTICLE: EditingArticle = { id: null, category_id: null, question: '', answer_markdown: '', sort_order: '0' }

export default function FaqEditor() {
  const [categories, setCategories] = useState<FaqCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditingArticle | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getPlatformFaq()
      setCategories(res.categories)
    } catch {
      setError('Failed to load FAQ.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!editing) return
    if (!editing.question.trim() || !editing.answer_markdown.trim()) {
      setSaveError('Question and answer are required.')
      return
    }
    setSaveError(null)
    setSaveLoading(true)
    try {
      if (editing.id) {
        await updateFaqArticle(editing.id, {
          question: editing.question,
          answer_markdown: editing.answer_markdown,
          sort_order: parseInt(editing.sort_order) || 0,
          category_id: editing.category_id,
        })
        setActionMsg('Article updated.')
      } else {
        await createFaqArticle({
          category_id: editing.category_id,
          question: editing.question,
          answer_markdown: editing.answer_markdown,
          sort_order: parseInt(editing.sort_order) || 0,
        })
        setActionMsg('Article created.')
      }
      setEditing(null)
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setSaveError(err?.response?.data?.detail || 'Failed to save article.')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleTogglePublish = async (article: FaqArticle) => {
    setActionMsg(null)
    try {
      await publishFaqArticle(article.id, !article.is_published)
      setActionMsg(article.is_published ? 'Article unpublished.' : 'Article published.')
      await load()
    } catch {
      setActionMsg('Failed to toggle publish status.')
    }
  }

  const handleDelete = async (article: FaqArticle) => {
    if (!window.confirm(`Delete "${article.question}"? This cannot be undone.`)) return
    setActionMsg(null)
    try {
      await deleteFaqArticle(article.id)
      setActionMsg('Article deleted.')
      await load()
    } catch {
      setActionMsg('Failed to delete article.')
    }
  }

  if (loading) return <div style={{ color: C.muted, fontSize: '14px', fontFamily: FONT }}>Loading FAQ...</div>
  if (error) return <div style={{ color: C.error, fontSize: '14px', fontFamily: FONT }}>{error}</div>

  const allArticles: (FaqArticle & { categoryTitle?: string })[] = categories.flatMap(cat =>
    cat.articles.map(a => ({ ...a, categoryTitle: cat.title }))
  )

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: C.text }}>FAQ Editor</h2>
        <button
          onClick={() => { setEditing({ ...BLANK_ARTICLE }); setSaveError(null) }}
          style={{ background: C.accent, border: 'none', borderRadius: '8px', color: '#fff', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}
        >
          + New article
        </button>
      </div>

      {actionMsg && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: `1px solid ${C.success}`, borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: C.success, marginBottom: '16px' }}>
          {actionMsg}
        </div>
      )}

      {/* Editor panel */}
      {editing && (
        <div style={{ background: C.surface, border: `1px solid ${C.accent}`, borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: C.text }}>
            {editing.id ? 'Edit article' : 'New article'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              type="text"
              placeholder="Question"
              value={editing.question}
              onChange={e => setEditing(s => s ? { ...s, question: e.target.value } : s)}
              style={inputStyle}
            />
            <textarea
              placeholder="Answer (plain text or Markdown)"
              value={editing.answer_markdown}
              onChange={e => setEditing(s => s ? { ...s, answer_markdown: e.target.value } : s)}
              rows={5}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ fontSize: '12px', color: C.muted, display: 'block', marginBottom: '4px' }}>Category</label>
                <select
                  value={editing.category_id || ''}
                  onChange={e => setEditing(s => s ? { ...s, category_id: e.target.value || null } : s)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">No category</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.title}</option>)}
                </select>
              </div>
              <div style={{ width: '80px' }}>
                <label style={{ fontSize: '12px', color: C.muted, display: 'block', marginBottom: '4px' }}>Sort order</label>
                <input
                  type="number"
                  value={editing.sort_order}
                  onChange={e => setEditing(s => s ? { ...s, sort_order: e.target.value } : s)}
                  style={inputStyle}
                />
              </div>
            </div>
            {saveError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.error}`, borderRadius: '8px', padding: '10px', fontSize: '13px', color: C.error }}>{saveError}</div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleSave} disabled={saveLoading} style={{ background: C.accent, border: 'none', borderRadius: '8px', color: '#fff', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: saveLoading ? 'not-allowed' : 'pointer', fontFamily: FONT, opacity: saveLoading ? 0.7 : 1 }}>
                {saveLoading ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditing(null)} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '8px', color: C.muted, padding: '8px 14px', fontSize: '13px', cursor: 'pointer', fontFamily: FONT }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Article list */}
      {allArticles.length === 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '40px', textAlign: 'center', color: C.muted, fontSize: '14px' }}>
          No FAQ articles yet. Create one above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {allArticles.map(article => (
            <div key={article.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '4px' }}>{article.question}</div>
                <div style={{ fontSize: '12px', color: C.muted }}>
                  {article.categoryTitle && <span style={{ marginRight: '8px' }}>{article.categoryTitle}</span>}
                  <span style={{ color: article.is_published ? C.success : C.warning, fontWeight: 600 }}>
                    {article.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button
                  onClick={() => { setEditing({ id: article.id, category_id: null, question: article.question, answer_markdown: article.answer_markdown, sort_order: String(article.sort_order) }); setSaveError(null) }}
                  style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '6px', color: C.muted, padding: '4px 10px', fontSize: '12px', cursor: 'pointer', fontFamily: FONT }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleTogglePublish(article)}
                  style={{ background: 'transparent', border: `1px solid ${article.is_published ? C.warning : C.success}`, borderRadius: '6px', color: article.is_published ? C.warning : C.success, padding: '4px 10px', fontSize: '12px', cursor: 'pointer', fontFamily: FONT }}
                >
                  {article.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  onClick={() => handleDelete(article)}
                  style={{ background: 'transparent', border: `1px solid ${C.error}`, borderRadius: '6px', color: C.error, padding: '4px 10px', fontSize: '12px', cursor: 'pointer', fontFamily: FONT }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: C.input,
  border: `1px solid ${C.border}`,
  borderRadius: '8px',
  color: C.text,
  padding: '8px 12px',
  fontSize: '13px',
  fontFamily: FONT,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}
