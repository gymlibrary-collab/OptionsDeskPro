import { useEffect, useState, useCallback } from 'react'
import { getPlatformPricing, patchPlatformPricing, PlatformPlan, PricingPatchRequest } from '../../api/client'
import { useStaffAuth } from '../../context/StaffAuthContext'

const PLATFORM_FEATURE_LABELS: Record<string, string> = {
  trading_desk: 'Trading Desk',
  positions: 'Positions & P&L',
  risk_monitor: 'Risk Monitor',
}

const AI_FEATURE_LABELS: Record<string, string> = {
  ai_narrative: 'Strategy Narrative',
  ai_chat: 'Portfolio Chat',
  ai_risk_summary: 'AI Risk Summary',
  ai_strategy_reasoning: 'Strategy Reasoning',
  ai_earnings_awareness: 'Earnings Awareness',
  trade_journal: 'Trade Journal Review',
  roll_advisor: 'Roll / Adjustment Advisor',
  greeks_coaching: 'Portfolio Greeks Coaching',
}

const ALL_FEATURE_KEYS = [
  ...Object.keys(PLATFORM_FEATURE_LABELS),
  ...Object.keys(AI_FEATURE_LABELS),
]

function featureLabel(key: string): string {
  return PLATFORM_FEATURE_LABELS[key] ?? AI_FEATURE_LABELS[key] ?? key.replace(/_/g, ' ')
}

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

interface EditState {
  price_monthly_usd: string
  max_symbols: string
  max_scans_per_month: string
  features: Record<string, boolean>
}

interface PricingManagerProps {
  staffRole?: string | null
}

export default function PricingManager({ staffRole: staffRoleProp }: PricingManagerProps) {
  const { staffRole: contextRole } = useStaffAuth()
  // Accept staffRole from parent (AdminApp passes it) or fall back to context
  const staffRole = staffRoleProp !== undefined ? staffRoleProp : contextRole
  const [plans, setPlans] = useState<PlatformPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingTier, setEditingTier] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [affectedCount, setAffectedCount] = useState<number | null>(null)
  const [pendingChange, setPendingChange] = useState<{ tierKey: string; req: PricingPatchRequest } | null>(null)

  const isOwner = staffRole === 'owner'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getPlatformPricing()
      setPlans(res.plans)
    } catch {
      setError('Failed to load pricing.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const startEdit = (plan: PlatformPlan) => {
    setEditingTier(plan.tier_key)
    // Merge backend features with all known feature keys (AI keys may be absent in older plans)
    const mergedFeatures: Record<string, boolean> = {}
    for (const key of ALL_FEATURE_KEYS) {
      mergedFeatures[key] = (plan.features as Record<string, boolean>)[key] ?? false
    }
    // Also preserve any unknown keys from the backend
    for (const [key, val] of Object.entries(plan.features)) {
      if (!(key in mergedFeatures)) {
        mergedFeatures[key] = val as boolean
      }
    }
    setEditState({
      price_monthly_usd: String(plan.price_monthly_usd),
      max_symbols: plan.max_symbols !== null ? String(plan.max_symbols) : '',
      max_scans_per_month: plan.max_scans_per_month !== null ? String(plan.max_scans_per_month) : '',
      features: mergedFeatures,
    })
    setSaveError(null)
    setSaveSuccess(null)
    setAffectedCount(null)
    setPendingChange(null)
  }

  const cancelEdit = () => {
    setEditingTier(null)
    setEditState(null)
    setPendingChange(null)
    setAffectedCount(null)
    setSaveError(null)
  }

  const handleSave = async () => {
    if (!editingTier || !editState) return
    const req: PricingPatchRequest = {
      price_monthly_usd: parseFloat(editState.price_monthly_usd) || undefined,
      max_symbols: editState.max_symbols ? parseInt(editState.max_symbols) : null,
      max_scans_per_month: editState.max_scans_per_month ? parseInt(editState.max_scans_per_month) : null,
      features_json: editState.features as Parameters<typeof patchPlatformPricing>[1]['features_json'],
    }

    // First call to get affected_count
    if (!pendingChange) {
      setSaveLoading(true)
      setSaveError(null)
      try {
        const res = await patchPlatformPricing(editingTier, req)
        if (res.affected_subscriber_count > 0) {
          setAffectedCount(res.affected_subscriber_count)
          setPendingChange({ tierKey: editingTier, req })
          setSaveLoading(false)
          return
        }
        setSaveSuccess(`Pricing updated for ${editingTier}.`)
        setEditingTier(null)
        await load()
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } } }
        setSaveError(err?.response?.data?.detail || 'Failed to save pricing.')
      } finally {
        setSaveLoading(false)
      }
      return
    }

    // Confirmed after seeing affected count
    setSaveLoading(true)
    setSaveError(null)
    try {
      await patchPlatformPricing(pendingChange.tierKey, pendingChange.req)
      setSaveSuccess(`Pricing updated for ${pendingChange.tierKey}.`)
      setPendingChange(null)
      setAffectedCount(null)
      setEditingTier(null)
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setSaveError(err?.response?.data?.detail || 'Failed to save pricing.')
    } finally {
      setSaveLoading(false)
    }
  }

  if (loading) return <div style={{ color: C.muted, fontSize: '14px', fontFamily: FONT }}>Loading pricing...</div>
  if (error) return <div style={{ color: C.error, fontSize: '14px', fontFamily: FONT }}>{error}</div>

  return (
    <div style={{ fontFamily: FONT }}>
      <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: C.text }}>Pricing Manager</h2>

      {saveSuccess && <div style={{ background: 'rgba(34,197,94,0.1)', border: `1px solid ${C.success}`, borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: C.success, marginBottom: '16px' }}>{saveSuccess}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        {plans.map(plan => {
          const isEditing = editingTier === plan.tier_key
          return (
            <div key={plan.tier_key} style={{ background: C.surface, border: `1px solid ${isEditing ? C.accent : C.border}`, borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: C.text }}>{plan.display_name}</h3>
                {isOwner && !isEditing && plan.tier_key !== 'free' && (
                  <button onClick={() => startEdit(plan)} style={{ background: C.accent, border: 'none', borderRadius: '6px', color: '#fff', padding: '4px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                    Edit
                  </button>
                )}
              </div>

              {isEditing && editState ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '12px', color: C.muted }}>Price (USD/mo)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editState.price_monthly_usd}
                    onChange={e => setEditState(s => s ? { ...s, price_monthly_usd: e.target.value } : s)}
                    style={inputStyle}
                  />
                  <label style={{ fontSize: '12px', color: C.muted }}>Max symbols (blank = unlimited)</label>
                  <input
                    type="number"
                    min="0"
                    value={editState.max_symbols}
                    onChange={e => setEditState(s => s ? { ...s, max_symbols: e.target.value } : s)}
                    style={inputStyle}
                    placeholder="unlimited"
                  />
                  <label style={{ fontSize: '12px', color: C.muted }}>Max scans/month (blank = unlimited)</label>
                  <input
                    type="number"
                    min="0"
                    value={editState.max_scans_per_month}
                    onChange={e => setEditState(s => s ? { ...s, max_scans_per_month: e.target.value } : s)}
                    style={inputStyle}
                    placeholder="unlimited"
                  />
                  {/* Platform Features group */}
                  <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '4px' }}>
                    Platform Features
                  </div>
                  {Object.keys(PLATFORM_FEATURE_LABELS).map(key => {
                    const val = editState.features[key] ?? false
                    return (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: C.text, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={val}
                          onChange={e => setEditState(s => s ? { ...s, features: { ...s.features, [key]: e.target.checked } } : s)}
                        />
                        {PLATFORM_FEATURE_LABELS[key]}
                      </label>
                    )
                  })}

                  {/* AI Features group */}
                  <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '8px' }}>
                    AI Features
                  </div>
                  {Object.keys(AI_FEATURE_LABELS).map(key => {
                    const val = editState.features[key] ?? false
                    return (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: C.text, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={val}
                          onChange={e => setEditState(s => s ? { ...s, features: { ...s.features, [key]: e.target.checked } } : s)}
                        />
                        {AI_FEATURE_LABELS[key]}
                      </label>
                    )
                  })}

                  {/* Any remaining unknown feature keys */}
                  {Object.entries(editState.features)
                    .filter(([key]) => !ALL_FEATURE_KEYS.includes(key))
                    .map(([key, val]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: C.text, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={val}
                          onChange={e => setEditState(s => s ? { ...s, features: { ...s.features, [key]: e.target.checked } } : s)}
                        />
                        {key.replace(/_/g, ' ')}
                      </label>
                    ))}

                  {affectedCount !== null && affectedCount > 0 && (
                    <div style={{ background: 'rgba(245,158,11,0.1)', border: `1px solid ${C.warning}`, borderRadius: '8px', padding: '10px', fontSize: '13px', color: C.warning }}>
                      This change affects {affectedCount} active subscriber(s). Click Save again to confirm.
                    </div>
                  )}

                  {saveError && <div style={{ background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.error}`, borderRadius: '8px', padding: '10px', fontSize: '13px', color: C.error }}>{saveError}</div>}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button onClick={handleSave} disabled={saveLoading} style={{ background: C.accent, border: 'none', borderRadius: '8px', color: '#fff', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: saveLoading ? 'not-allowed' : 'pointer', fontFamily: FONT, opacity: saveLoading ? 0.7 : 1 }}>
                      {saveLoading ? 'Saving...' : affectedCount !== null && affectedCount > 0 ? 'Confirm save' : 'Save'}
                    </button>
                    <button onClick={cancelEdit} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '8px', color: C.muted, padding: '8px 14px', fontSize: '13px', cursor: 'pointer', fontFamily: FONT }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <PlanField label="Price" value={`$${plan.price_monthly_usd}/mo`} />
                  <PlanField label="Max symbols" value={plan.max_symbols !== null ? String(plan.max_symbols) : 'Unlimited'} />
                  <PlanField label="Max scans" value={plan.max_scans_per_month !== null ? String(plan.max_scans_per_month) : 'Unlimited'} />
                  <div style={{ fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 0 2px' }}>
                    Platform
                  </div>
                  {Object.keys(PLATFORM_FEATURE_LABELS).map(k => (
                    <PlanField key={k} label={PLATFORM_FEATURE_LABELS[k]} value={(plan.features as Record<string, boolean>)[k] ? '✓' : '—'} />
                  ))}
                  <div style={{ fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 0 2px' }}>
                    AI Features
                  </div>
                  {Object.keys(AI_FEATURE_LABELS).map(k => (
                    <PlanField key={k} label={AI_FEATURE_LABELS[k]} value={(plan.features as Record<string, boolean>)[k] ? '✓' : '—'} />
                  ))}
                  {Object.entries(plan.features)
                    .filter(([k]) => !ALL_FEATURE_KEYS.includes(k))
                    .map(([k, v]) => (
                      <PlanField key={k} label={featureLabel(k)} value={v ? '✓' : '—'} />
                    ))}
                  {plan.stripe_price_id && (
                    <PlanField label="Stripe price ID" value={`...${plan.stripe_price_id.slice(-8)}`} />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PlanField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid rgba(45,49,72,0.4)` }}>
      <span style={{ fontSize: '12px', color: C.muted }}>{label}</span>
      <span style={{ fontSize: '12px', color: C.text, fontWeight: 600 }}>{value}</span>
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
