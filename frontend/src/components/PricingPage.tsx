import { useEffect, useState } from 'react'
import { Plan, getPublicPricing, createCheckoutSession } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useWindowSize } from '../hooks/useWindowSize'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
  input: '#252836',
  success: '#22c55e',
  error: '#ef4444',
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

const FEATURE_LABELS: Record<string, string> = {
  trading_desk: 'Trading Desk',
  positions: 'Positions & P&L',
  risk_monitor: 'Risk Monitor',
}

interface Props {
  onUpgrade?: (tier: string) => void
  onClose?: () => void
  currentTier?: string
}

export default function PricingPage({ onUpgrade, onClose, currentTier }: Props) {
  const { user } = useAuth()
  const { isMobile } = useWindowSize()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getPublicPricing()
      .then(data => setPlans(data.plans))
      .catch(() => setError('Unable to load pricing. Please try again.'))
      .finally(() => setLoading(false))
  }, [])

  const handleSelect = async (plan: Plan) => {
    if (plan.contact_us) {
      window.open('mailto:support@optionsdeskpro.com?subject=Enterprise+Enquiry', '_blank')
      return
    }
    if (plan.tier_key === 'free') {
      onUpgrade?.('free')
      return
    }
    if (!user) {
      onUpgrade?.(plan.tier_key)
      return
    }
    setCheckoutError(null)
    setCheckoutLoading(plan.tier_key)
    try {
      const { checkout_url } = await createCheckoutSession({ tier_key: plan.tier_key })
      window.location.href = checkout_url
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setCheckoutError(err?.response?.data?.detail || 'Unable to start checkout. Please try again.')
      setCheckoutLoading(null)
    }
  }

  const isCurrent = (plan: Plan) => plan.tier_key === currentTier

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px', background: C.bg, minHeight: '300px' }}>
        <span style={{ color: C.muted, fontSize: '14px' }}>Loading pricing...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '40px', background: C.bg, textAlign: 'center' }}>
        <div style={{ color: C.error, fontSize: '14px', marginBottom: '16px' }}>{error}</div>
        <button onClick={() => window.location.reload()} style={{ background: C.accent, border: 'none', borderRadius: '8px', color: '#fff', padding: '8px 20px', cursor: 'pointer', fontFamily: FONT }}>Retry</button>
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

      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: isMobile ? '24px' : '32px', fontWeight: 700, color: C.text }}>
          Choose your plan
        </h1>
        <p style={{ margin: 0, color: C.muted, fontSize: '15px' }}>
          Start free. Upgrade when you are ready.
        </p>
      </div>

      {checkoutError && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.error}`, borderRadius: '8px', padding: '12px 16px', marginBottom: '24px', color: C.error, fontSize: '14px', textAlign: 'center' }}>
          {checkoutError}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : `repeat(${plans.length}, 1fr)`,
        gap: '16px',
        maxWidth: '960px',
        margin: '0 auto',
      }}>
        {plans.map(plan => {
          const highlighted = plan.tier_key === 'pro'
          const current = isCurrent(plan)
          const busy = checkoutLoading === plan.tier_key

          return (
            <div
              key={plan.tier_key}
              style={{
                background: C.surface,
                border: `1px solid ${highlighted ? C.accent : C.border}`,
                borderRadius: '12px',
                padding: '28px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0',
                position: 'relative',
                boxShadow: highlighted ? `0 0 24px rgba(124,106,247,0.2)` : 'none',
              }}
            >
              {highlighted && (
                <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: C.accent, color: '#fff', padding: '4px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                  MOST POPULAR
                </div>
              )}

              <h2 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 700, color: C.text }}>
                {plan.display_name}
              </h2>
              <div style={{ marginBottom: '20px' }}>
                {plan.price_monthly_usd === 0 ? (
                  <span style={{ fontSize: '28px', fontWeight: 700, color: C.text }}>Free</span>
                ) : plan.contact_us ? (
                  <span style={{ fontSize: '22px', fontWeight: 700, color: C.text }}>Custom</span>
                ) : (
                  <>
                    <span style={{ fontSize: '28px', fontWeight: 700, color: C.text }}>${plan.price_monthly_usd}</span>
                    <span style={{ fontSize: '14px', color: C.muted }}>/month</span>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px', flex: 1 }}>
                <FeatureRow label={`${plan.max_symbols ?? 'Unlimited'} watchlist symbols`} included />
                <FeatureRow label={plan.max_scans_per_month ? `${plan.max_scans_per_month} scans/month` : 'Unlimited scans'} included />
                {Object.entries(plan.features).map(([key, val]) => (
                  <FeatureRow key={key} label={FEATURE_LABELS[key] || key} included={val} />
                ))}
              </div>

              <button
                onClick={() => handleSelect(plan)}
                disabled={current || busy}
                style={{
                  background: current ? 'transparent' : highlighted ? C.accent : '#252836',
                  border: `1px solid ${current ? C.success : highlighted ? C.accent : C.border}`,
                  borderRadius: '8px',
                  color: current ? C.success : highlighted ? '#fff' : C.text,
                  padding: '10px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: current || busy ? 'default' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                  fontFamily: FONT,
                }}
              >
                {busy ? 'Redirecting...' : current ? 'Current plan' : plan.contact_us ? 'Contact us' : plan.tier_key === 'free' ? 'Get started' : `Upgrade to ${plan.display_name}`}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FeatureRow({ label, included }: { label: string; included: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
      <span style={{ color: included ? '#22c55e' : '#475569', fontWeight: 700, flexShrink: 0 }}>
        {included ? 'Y' : 'N'}
      </span>
      <span style={{ color: included ? '#cbd5e1' : '#475569' }}>{label}</span>
    </div>
  )
}
