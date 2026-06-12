import { useEffect, useState } from 'react'
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

  // Called by PricingPage when free tier is selected.
  // Paid tiers are handled inside PricingPage (calls checkout-session + redirects).
  // When a paid flow returns via /onboarding/complete, the useEffect above sets step='complete'.
  const handleTierSelect = (tier: string) => {
    if (tier === 'free') {
      setStep('complete')
    }
    // Paid tiers: PricingPage redirects to Stripe, no action needed here
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

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: isMobile ? '12px' : '16px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '20px', color: C.accent }}>&#x2B21;</span>
        <span style={{ fontSize: '16px', fontWeight: 700, color: C.text }}>Welcome to OptionsDesk</span>
      </div>

      <div style={{ padding: isMobile ? '16px 12px' : '24px' }}>
        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', justifyContent: 'center' }}>
          {(['plan_selection', 'payment', 'complete'] as Step[]).map((s, i) => {
            const active = s === step
            const done = i < (['plan_selection', 'payment', 'complete'] as Step[]).indexOf(step)
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {i > 0 && <div style={{ width: isMobile ? '20px' : '40px', height: '1px', background: done ? C.accent : C.border }} />}
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

        {/* PricingPage handles both free (calls onUpgrade) and paid (redirects to Stripe) */}
        <PricingPage onUpgrade={handleTierSelect} />
      </div>
    </div>
  )
}
