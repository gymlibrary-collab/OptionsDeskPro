import { useEffect, useRef, useState } from 'react'
import { getLegalCurrentVersion, postLegalAcknowledge, LegalVersion } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useWindowSize } from '../hooks/useWindowSize'

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
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

export default function LegalAcknowledgmentGate() {
  const { clearLegalAcknowledgmentPending } = useAuth()
  const { isMobile } = useWindowSize()

  const [version, setVersion] = useState<LegalVersion | null>(null)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const [checkboxChecked, setCheckboxChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setFetchLoading(true)
    setFetchError(null)
    getLegalCurrentVersion()
      .then(v => {
        if (!cancelled) {
          setVersion(v)
          setFetchLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchError('Unable to load the legal agreement. Please refresh the page.')
          setFetchLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  const handleScroll = () => {
    if (hasScrolledToBottom) return
    const el = contentRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
      setHasScrolledToBottom(true)
    }
  }

  const handleSubmit = async () => {
    if (!version || !checkboxChecked || !hasScrolledToBottom) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await postLegalAcknowledge({ version_id: version.id, content_hash: version.content_hash })
      clearLegalAcknowledgmentPending()
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { detail?: string } } }
      if (err?.response?.status === 409) {
        setSubmitError(
          'The legal terms have been updated since this page loaded. Please scroll through the updated text and re-read before agreeing.'
        )
        // Re-fetch to get the latest version
        setHasScrolledToBottom(false)
        setCheckboxChecked(false)
        setFetchLoading(true)
        getLegalCurrentVersion()
          .then(v => { setVersion(v); setFetchLoading(false) })
          .catch(() => { setFetchError('Unable to reload the legal agreement. Please refresh.'); setFetchLoading(false) })
      } else {
        setSubmitError('Could not record your acknowledgment. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = hasScrolledToBottom && checkboxChecked && !submitting

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: 'rgba(15, 17, 23, 0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? '12px' : '24px',
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: '16px',
          width: '100%',
          maxWidth: '640px',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: isMobile ? '16px' : '24px 28px 20px',
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px', color: C.accent }}>&#x2B21;</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: C.accent, letterSpacing: '0.05em', textTransform: 'uppercase' }}>OptionsDesk</span>
          </div>
          <h2 style={{ margin: 0, fontSize: isMobile ? '18px' : '20px', fontWeight: 700, color: C.text }}>
            Updated Legal Terms
          </h2>
          {version && !fetchLoading && (
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: C.muted }}>
              {version.title} &mdash; Effective {version.effective_date}
            </p>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {fetchLoading && (
            <div style={{ padding: '40px', textAlign: 'center', color: C.muted, fontSize: '14px' }}>
              Loading agreement...
            </div>
          )}
          {fetchError && (
            <div style={{ padding: '24px 28px' }}>
              <div style={{ background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.red}`, borderRadius: '8px', padding: '14px 16px', fontSize: '14px', color: C.red }}>
                {fetchError}
              </div>
            </div>
          )}
          {!fetchLoading && !fetchError && version && (
            <div
              ref={contentRef}
              onScroll={handleScroll}
              style={{
                flex: 1,
                overflowY: 'scroll',
                padding: isMobile ? '16px' : '20px 28px',
                maxHeight: '60vh',
              }}
            >
              <pre
                style={{
                  margin: 0,
                  fontFamily: FONT,
                  fontSize: '13px',
                  lineHeight: 1.7,
                  color: C.text,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {version.content_markdown}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        {!fetchLoading && !fetchError && version && (
          <div
            style={{
              padding: isMobile ? '16px' : '20px 28px',
              borderTop: `1px solid ${C.border}`,
              flexShrink: 0,
              background: C.surface2,
            }}
          >
            {!hasScrolledToBottom && (
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: C.muted, fontStyle: 'italic' }}>
                Please scroll to the bottom of the agreement to enable the checkbox.
              </p>
            )}

            {submitError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.red}`, borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: C.red, marginBottom: '12px' }}>
                {submitError}
              </div>
            )}

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                marginBottom: '16px',
                cursor: hasScrolledToBottom ? 'pointer' : 'not-allowed',
                opacity: hasScrolledToBottom ? 1 : 0.45,
              }}
            >
              <input
                type="checkbox"
                disabled={!hasScrolledToBottom}
                checked={checkboxChecked}
                onChange={e => setCheckboxChecked(e.target.checked)}
                style={{ marginTop: '2px', flexShrink: 0, accentColor: C.accent, width: '16px', height: '16px', cursor: hasScrolledToBottom ? 'pointer' : 'not-allowed' }}
              />
              <span style={{ fontSize: '13px', color: C.text, lineHeight: 1.5 }}>
                I have read and agree to the {version.title} (v{version.version_number})
              </span>
            </label>

            <button
              disabled={!canSubmit}
              onClick={handleSubmit}
              style={{
                width: '100%',
                background: canSubmit ? C.accent : C.surface2,
                border: `1px solid ${canSubmit ? C.accent : C.border}`,
                borderRadius: '8px',
                color: canSubmit ? '#fff' : C.muted,
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                fontFamily: FONT,
                transition: 'all 0.15s',
              }}
            >
              {submitting ? 'Recording...' : 'I Agree & Continue'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
