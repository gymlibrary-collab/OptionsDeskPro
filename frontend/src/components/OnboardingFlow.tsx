import { useState } from 'react'
import { createCheckoutSession } from '../api/client'
import PricingPage from './PricingPage'
import { useWindowSize } from '../hooks/useWindowSize'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
  success: '#22c55e',
  error: '#ef4444',
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

type Step = 'plan_selection' | 'payment' | 'complete'

interface Props {
  initialStep?: Step
  onComplete: () => void
}

export default function OnboardingFlow({ initialStep = 'plan_selection', onComplete }: Props) {
  const { isMobile } = useWindowSize()
  const [step, setStep] = useState<Step>(initialStep)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  const handleTierSelect = async (tier: string) => {
    if (tier === 'free') {
      setStep('complete')
      return
    }
    setCheckoutError(null)
    setCheckoutLoading(true)
    try {
      const { checkout_url } = await createCheckoutSession({ tier_key: tier })
      window.location.href = checkout_url
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setCheckoutError(err?.response?.data?.detail || 'Unable to start checkout. Please try again.')
      setCheckoutLoading(false)
    }
  }

  if (step === 'complete') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg, fontFamily: FONT, padding: '20px' }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '48px 40px', maxWidth: '440px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>Y</div>
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

  if (step === 'payment' && checkoutLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg, fontFamily: FONT }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: C.muted, marginBottom: '8px' }}>Redirecting to secure payment...</div>
          <div style={{ fontSize: '13px', color: '#475569' }}>You will be redirected to Stripe to enter your card details.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: isMobile ? '12px' : '16px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '20px', color: C.accent }}>⬡</span>
        <span style={{ fontSize: '16px', fontWeight: 700, color: C.text }}>Welcome to OptionsDesk</span>
      </div>

      <div style={{ padding: isMobile ? '16px 12px' : '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', justifyContent: 'center' }}>
          {(['plan_selection', 'payment', 'complete'] as Step[]).map((s, i) => {
            const active = s === step
            const done = i < (['plan_selection', 'payment', 'complete'] as Step[]).indexOf(step)
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {i > 0 && <div style={{ width: isMobile ? '20px' : '40px', height: '1px', background: done ? C.accent : C.border }} />}
                <div style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  background: done ? C.accent : active ? 'transparent' : 'transparent',
                  border: `2px solid ${done || active ? C.accent : C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 700,
                  color: done ? '#fff' : active ? C.accent : C.muted,
                }}>
                  {done ? 'Y' : i + 1}
                </div>
              </div>
            )
          })}
        </div>

        {checkoutError && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.error}`, borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: C.error, fontSize: '14px', maxWidth: '960px', margin: '0 auto 16px' }}>
            {checkoutError}
          </div>
        )}

        <PricingPage onUpgrade={handleTierSelect} />
      </div>
    </div>
  )
}
