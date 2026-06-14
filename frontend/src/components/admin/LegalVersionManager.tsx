import { useCallback, useEffect, useState } from 'react'
import {
  getLegalCurrentVersion,
  getPlatformLegalVersions,
  postPlatformLegalVersion,
  getPlatformLegalPendingCount,
  LegalVersion,
} from '../../api/client'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  surface2: '#20243a',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
  green: '#22c55e',
  red: '#ef4444',
  warning: '#f59e0b',
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  })
}

async function computeSha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

interface Props {
  staffRole: string | null
}

export default function LegalVersionManager({ staffRole }: Props) {
  const isOwner = staffRole === 'owner'

  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [currentVersionNumber, setCurrentVersionNumber] = useState<string | null>(null)
  const [pendingLoading, setPendingLoading] = useState(true)
  const [pendingError, setPendingError] = useState<string | null>(null)

  const [versions, setVersions] = useState<LegalVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(true)
  const [versionsError, setVersionsError] = useState<string | null>(null)

  const [activeVersion, setActiveVersion] = useState<LegalVersion | null>(null)
  const [activeLoading, setActiveLoading] = useState(true)
  const [activeError, setActiveError] = useState<string | null>(null)

  // Publish form state (owner only)
  const [showPublishForm, setShowPublishForm] = useState(false)
  const [publishVersionNumber, setPublishVersionNumber] = useState('')
  const [publishTitle, setPublishTitle] = useState('')
  const [publishEffectiveDate, setPublishEffectiveDate] = useState('')
  const [publishContent, setPublishContent] = useState('')
  const [publishConfirm, setPublishConfirm] = useState('')
  const [publishPreviewHash, setPublishPreviewHash] = useState<string | null>(null)
  const [publishLoading, setPublishLoading] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null)

  const loadPending = useCallback(async () => {
    setPendingLoading(true)
    setPendingError(null)
    try {
      const res = await getPlatformLegalPendingCount()
      setPendingCount(res.pending_count)
      setCurrentVersionNumber(res.current_version_number)
    } catch {
      setPendingError('Failed to load pending count.')
    } finally {
      setPendingLoading(false)
    }
  }, [])

  const loadVersions = useCallback(async () => {
    setVersionsLoading(true)
    setVersionsError(null)
    try {
      const res = await getPlatformLegalVersions()
      setVersions(res.versions)
    } catch {
      setVersionsError('Failed to load version history.')
    } finally {
      setVersionsLoading(false)
    }
  }, [])

  const loadActive = useCallback(async () => {
    setActiveLoading(true)
    setActiveError(null)
    try {
      const v = await getLegalCurrentVersion()
      setActiveVersion(v)
    } catch (e: unknown) {
      const err = e as { response?: { status?: number } }
      if (err?.response?.status === 404) {
        setActiveVersion(null)
        setActiveError(null)
      } else {
        setActiveError('Failed to load current version.')
      }
    } finally {
      setActiveLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPending()
    loadVersions()
    loadActive()
  }, [loadPending, loadVersions, loadActive])

  // Update hash preview as owner types content
  useEffect(() => {
    if (!publishContent.trim()) {
      setPublishPreviewHash(null)
      return
    }
    let cancelled = false
    computeSha256(publishContent).then(hash => {
      if (!cancelled) setPublishPreviewHash(hash)
    })
    return () => { cancelled = true }
  }, [publishContent])

  const handlePublish = async () => {
    if (!publishVersionNumber.trim() || !publishTitle.trim() || !publishEffectiveDate || !publishContent.trim()) {
      setPublishError('All fields are required.')
      return
    }
    if (publishConfirm !== 'PUBLISH') {
      setPublishError('Type PUBLISH to confirm.')
      return
    }
    setPublishLoading(true)
    setPublishError(null)
    setPublishSuccess(null)
    try {
      await postPlatformLegalVersion({
        version_number: publishVersionNumber.trim(),
        display_name: publishTitle.trim(),
        full_text: publishContent,
        effective_date: publishEffectiveDate,
      })
      setPublishSuccess(`Version ${publishVersionNumber} published successfully.`)
      setPublishVersionNumber('')
      setPublishTitle('')
      setPublishEffectiveDate('')
      setPublishContent('')
      setPublishConfirm('')
      setPublishPreviewHash(null)
      setShowPublishForm(false)
      // Reload all data
      loadPending()
      loadVersions()
      loadActive()
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { detail?: string } } }
      if (err?.response?.status === 409) {
        setPublishError('Version number already exists. Choose a different version number.')
      } else if (err?.response?.status === 422) {
        setPublishError(err?.response?.data?.detail || 'Invalid input. Check all fields.')
      } else {
        setPublishError('Failed to publish version. Please try again.')
      }
    } finally {
      setPublishLoading(false)
    }
  }

  const publishButtonEnabled = publishConfirm === 'PUBLISH' && !publishLoading

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: C.text }}>Legal Documents</h2>
        {isOwner && !showPublishForm && (
          <button
            onClick={() => { setShowPublishForm(true); setPublishError(null); setPublishSuccess(null) }}
            style={{ background: C.accent, border: 'none', borderRadius: '8px', color: '#fff', padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}
          >
            Publish New Version
          </button>
        )}
      </div>

      {publishSuccess && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: `1px solid ${C.green}`, borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: C.green, marginBottom: '16px' }}>
          {publishSuccess}
        </div>
      )}

      {/* Pending acknowledgments */}
      <SectionCard title="Pending Acknowledgments">
        {pendingLoading ? (
          <div style={{ color: C.muted, fontSize: '13px' }}>Loading...</div>
        ) : pendingError ? (
          <ErrorMsg msg={pendingError} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  background: pendingCount && pendingCount > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                  border: `1px solid ${pendingCount && pendingCount > 0 ? C.red : C.green}`,
                  borderRadius: '20px',
                  padding: '4px 14px',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: pendingCount && pendingCount > 0 ? C.red : C.green,
                }}
              >
                {pendingCount ?? 0}
              </span>
              <span style={{ fontSize: '13px', color: C.muted }}>
                subscriber{pendingCount !== 1 ? 's' : ''} pending re-acknowledgment
              </span>
            </div>
            {currentVersionNumber && (
              <span style={{ fontSize: '12px', color: C.muted }}>
                Current version: <strong style={{ color: C.text }}>v{currentVersionNumber}</strong>
              </span>
            )}
          </div>
        )}
      </SectionCard>

      {/* Current active version */}
      <SectionCard title="Current Active Version">
        {activeLoading ? (
          <div style={{ color: C.muted, fontSize: '13px' }}>Loading...</div>
        ) : activeError ? (
          <ErrorMsg msg={activeError} />
        ) : !activeVersion ? (
          <div style={{ color: C.muted, fontSize: '13px' }}>No version has been published yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <FieldRow label="Version" value={`v${activeVersion.version_number}`} />
            <FieldRow label="Title" value={activeVersion.display_name} />
            <FieldRow label="Effective date" value={fmtDate(activeVersion.effective_date)} />
            <FieldRow label="Published at" value={fmtDateTime(activeVersion.published_at)} />
            <FieldRow label="SHA-256 hash" value={activeVersion.text_hash} mono />
          </div>
        )}
      </SectionCard>

      {/* Publish form (owner only) */}
      {isOwner && showPublishForm && (
        <SectionCard title="Publish New Version">
          <div style={{ background: 'rgba(245,158,11,0.1)', border: `1px solid ${C.warning}`, borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: C.warning, marginBottom: '16px', lineHeight: 1.6 }}>
            Warning: Publishing a new version will require all subscribers to re-acknowledge the agreement before accessing the platform. This action cannot be undone.
          </div>

          {publishError && <ErrorMsg msg={publishError} />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <FormField label="Version number (e.g. 1.1)">
              <input
                type="text"
                value={publishVersionNumber}
                onChange={e => setPublishVersionNumber(e.target.value)}
                placeholder="1.1"
                style={inputStyle}
              />
            </FormField>

            <FormField label="Title (display name)">
              <input
                type="text"
                value={publishTitle}
                onChange={e => setPublishTitle(e.target.value)}
                placeholder="Risk Disclosure & Indemnification Agreement v1.1"
                style={inputStyle}
              />
            </FormField>

            <FormField label="Effective date">
              <input
                type="date"
                value={publishEffectiveDate}
                onChange={e => setPublishEffectiveDate(e.target.value)}
                style={inputStyle}
              />
            </FormField>

            <FormField label="Agreement text (full content)">
              <textarea
                value={publishContent}
                onChange={e => setPublishContent(e.target.value)}
                rows={16}
                placeholder="Paste the full agreement text here..."
                style={{ ...inputStyle, resize: 'vertical', fontFamily: FONT, lineHeight: 1.6 }}
              />
            </FormField>

            {publishPreviewHash && (
              <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', color: C.muted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>SHA-256 hash preview (informational)</div>
                <div style={{ fontSize: '12px', color: C.text, fontFamily: 'monospace', wordBreak: 'break-all' }}>{publishPreviewHash}</div>
              </div>
            )}

            <FormField label={'Type "PUBLISH" to confirm'}>
              <input
                type="text"
                value={publishConfirm}
                onChange={e => setPublishConfirm(e.target.value)}
                placeholder="PUBLISH"
                style={{ ...inputStyle, letterSpacing: '0.05em' }}
              />
            </FormField>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                disabled={!publishButtonEnabled}
                onClick={handlePublish}
                style={{
                  background: publishButtonEnabled ? C.red : C.surface2,
                  border: `1px solid ${publishButtonEnabled ? C.red : C.border}`,
                  borderRadius: '8px',
                  color: publishButtonEnabled ? '#fff' : C.muted,
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: publishButtonEnabled ? 'pointer' : 'not-allowed',
                  fontFamily: FONT,
                }}
              >
                {publishLoading ? 'Publishing...' : 'Publish Version'}
              </button>
              <button
                onClick={() => { setShowPublishForm(false); setPublishError(null) }}
                style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '8px', color: C.muted, padding: '10px 20px', fontSize: '13px', cursor: 'pointer', fontFamily: FONT }}
              >
                Cancel
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Version history */}
      <SectionCard title="Version History">
        {versionsLoading ? (
          <div style={{ color: C.muted, fontSize: '13px' }}>Loading...</div>
        ) : versionsError ? (
          <ErrorMsg msg={versionsError} />
        ) : versions.length === 0 ? (
          <div style={{ color: C.muted, fontSize: '13px' }}>No versions published yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['Version', 'Title', 'Effective Date', 'Published At', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', color: C.muted, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {versions.map(v => (
                  <tr key={v.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px', color: C.text, fontWeight: 600 }}>v{v.version_number}</td>
                    <td style={{ padding: '8px', color: C.muted }}>{v.display_name}</td>
                    <td style={{ padding: '8px', color: C.muted, whiteSpace: 'nowrap' }}>{fmtDate(v.effective_date)}</td>
                    <td style={{ padding: '8px', color: C.muted, whiteSpace: 'nowrap' }}>{fmtDateTime(v.published_at)}</td>
                    <td style={{ padding: '8px' }}>
                      {v.is_active ? (
                        <span style={{ background: 'rgba(34,197,94,0.15)', border: `1px solid ${C.green}`, borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: 700, color: C.green }}>
                          ACTIVE
                        </span>
                      ) : (
                        <span style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: 600, color: C.muted }}>
                          superseded
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '20px', marginBottom: '16px' }}>
      <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: C.text }}>{title}</h3>
      {children}
    </div>
  )
}

function FieldRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '5px 0', borderBottom: `1px solid rgba(45,49,72,0.5)`, gap: '12px' }}>
      <span style={{ fontSize: '13px', color: C.muted, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '13px', color: C.text, fontWeight: 600, fontFamily: mono ? 'monospace' : FONT, textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '12px', color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
      {children}
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div style={{ background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.red}`, borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: C.red, marginBottom: '12px' }}>
      {msg}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#252836',
  border: `1px solid ${C.border}`,
  borderRadius: '8px',
  color: C.text,
  padding: '8px 12px',
  fontSize: '13px',
  fontFamily: FONT,
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
}
