import { useEffect, useRef, useState } from 'react'
import PricingPage from './PricingPage'
import { useWindowSize } from '../hooks/useWindowSize'
import { getLegalCurrentVersion, postLegalAcknowledge, completeOnboarding, LegalVersion } from '../api/client'

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
  success: '#22c55e',
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

type Step = 'plan_selection' | 'legal_acknowledgment' | 'payment' | 'complete'

interface Props {
  initialStep?: Step
  onComplete: () => void
}

// ─── LegalAcknowledgmentStep ─────────────────────────────────────────────────

interface LegalAcknowledgmentStepProps {
  onAcknowledged: (selectedTier: string | null) => void
  selectedTier: string | null
}

function LegalAcknowledgmentStep({ onAcknowledged, selectedTier }: LegalAcknowledgmentStepProps) {
  const { isMobile } = useWindowSize()
  const [version, setVersion] = useState<LegalVersion | null>(null)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const [checkboxChecked, setCheckboxChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const contentRef = useRef<HTMLDivElement>(null)

  const loadVersion = () => {
    setFetchLoading(true)
    setFetchError(null)
    setHasScrolledToBottom(false)
    setCheckboxChecked(false)
    getLegalCurrentVersion()
      .then(v => { setVersion(v); setFetchLoading(false) })
      .catch(() => { setFetchError('Unable to load the legal agreement. Please refresh.'); setFetchLoading(false) })
  }

  useEffect(() => { loadVersion() }, [])

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
      onAcknowledged(selectedTier)
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { detail?: string } } }
      if (err?.response?.status === 409) {
        setSubmitError(
          'The legal terms have been updated. Please scroll through the updated text and re-read before agreeing.'
        )
        loadVersion()
      } else {
        setSubmitError('Could not record your acknowledgment. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = hasScrolledToBottom && checkboxChecked && !submitting

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: isMobile ? '16px' : '24px 28px 20px', borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ margin: '0 0 6px', fontSize: isMobile ? '18px' : '20px', fontWeight: 700, color: C.text }}>
            Risk Disclosure &amp; Indemnification Agreement
          </h2>
          {version && !fetchLoading && (
            <p style={{ margin: 0, fontSize: '13px', color: C.muted }}>
              {version.title} &mdash; Effective {version.effective_date}
            </p>
          )}
        </div>

        {/* Content */}
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
            <button
              onClick={loadVersion}
              style={{ marginTop: '12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '8px', color: C.muted, padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontFamily: FONT }}
            >
              Retry
            </button>
          </div>
        )}
        {!fetchLoading && !fetchError && version && (
          <>
            <div
              ref={contentRef}
              onScroll={handleScroll}
              style={{
                height: isMobile ? '40vh' : '50vh',
                overflowY: 'scroll',
                padding: isMobile ? '16px' : '20px 28px',
                borderBottom: `1px solid ${C.border}`,
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

            {/* Footer */}
            <div style={{ padding: isMobile ? '16px' : '20px 28px', background: C.surface2 }}>
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
          </>
        )}
      </div>
    </div>
  )
}

// ─── OnboardingFlow ────────────────────────────────────────────────────────────

export default function OnboardingFlow({ initialStep = 'plan_selection', onComplete }: Props) {
  const { isMobile } = useWindowSize()
  const [step, setStep] = useState<Step>(initialStep)
  const [selectedTier, setSelectedTier] = useState<string | null>(null)

  const STEPS: Step[] = ['plan_selection', 'legal_acknowledgment', 'payment', 'complete']

  // Handle /onboarding/complete path (Stripe success redirect)
  useEffect(() => {
    const path = window.location.pathname
    if (path === '/onboarding/complete' || path.startsWith('/onboarding/complete')) {
      setStep('complete')
      // Clean the URL without triggering a navigation
      window.history.replaceState({}, '', '/')
    } else if (path === '/onboarding/plan' || path.startsWith('/onboarding/plan')) {
      setStep('plan_selection')
      window.history.replaceState({}, '', '/')
    }
  }, [])

  // Called by PricingPage when a tier is selected.
  // For free: advance to legal_acknowledgment.
  // For paid: also advance to legal_acknowledgment first (Stripe redirect happens after legal).
  const handleTierSelect = (tier: string) => {
    setSelectedTier(tier)
    setStep('legal_acknowledgment')
  }

  // Called when legal step is acknowledged.
  const handleLegalAcknowledged = (tier: string | null) => {
    if (!tier || tier === 'free') {
      // Mark onboarding complete in DB so reload doesn't loop back here
      completeOnboarding().catch(() => {}).finally(() => setStep('complete'))
    } else {
      setStep('payment')
    }
  }

  if (step === 'complete') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg, fontFamily: FONT, padding: '20px' }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '48px 40px', maxWidth: '440px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', color: C.success }}>&#x2713;</div>
          <h1 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: 700, color: C.text }}>You are all set!</h1>
          <p style={{ margin: '0 0 28px', color: C.muted, fontSize: '14px', lineHeight: 1.7 }}>
            Your OptionsDesk account is ready. Start exploring the options chain and strategy scanner.
          </p>
          <button
            onClick={onComplete}
            style={{ background: C.accent, border: 'none', borderRadius: '8px', color: '#fff', padding: '12px 28px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, width: '100%' }}
          >
            Go to dashboard
          </button>
        </div>
      </div>
    )
  }

  const stepIndex = STEPS.indexOf(step)

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: isMobile ? '12px' : '16px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '20px', color: C.accent }}>&#x2B21;</span>
        <span style={{ fontSize: '16px', fontWeight: 700, color: C.text }}>Welcome to OptionsDesk</span>
      </div>

      <div style={{ padding: isMobile ? '16px 12px' : '24px' }}>
        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', justifyContent: 'center' }}>
          {STEPS.map((s, i) => {
            const active = s === step
            const done = i < stepIndex
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {i > 0 && <div style={{ width: isMobile ? '16px' : '32px', height: '1px', background: done ? C.accent : C.border }} />}
                <div style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  background: done ? C.accent : 'transparent',
                  border: `2px solid ${done || active ? C.accent : C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 700,
                  color: done ? '#fff' : active ? C.accent : C.muted,
                }}>
                  {done ? '✓' : i + 1}
                </div>
              </div>
            )
          })}
        </div>

        {step === 'plan_selection' && (
          <PricingPage onUpgrade={handleTierSelect} />
        )}

        {step === 'legal_acknowledgment' && (
          <LegalAcknowledgmentStep
            onAcknowledged={handleLegalAcknowledged}
            selectedTier={selectedTier}
          />
        )}

        {step === 'payment' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '30vh' }}>
            <div style={{ textAlign: 'center', color: C.muted, fontSize: '14px' }}>
              Redirecting to payment...
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
