import { useEffect, useState, useCallback } from 'react'
import {
  getSubscriberDetail,
  SubscriberDetailResponse,
  tierOverride,
  deactivateSubscriber,
  reactivateSubscriber,
  startSupportSession,
  endSupportSession,
  getSubscriberLegalHistory,
  LegalAcknowledgmentHistory,
} from '../../api/client'
import { useStaffAuth } from '../../context/StaffAuthContext'

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
  supportBanner: '#78350f',
  supportBannerBorder: '#f59e0b',
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

const TIER_OPTIONS = ['free', 'starter', 'pro', 'enterprise']

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const fmtAmount = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount)

interface Props {
  userId: string
  onBack: () => void
}

export default function SubscriberDetail({ userId, onBack }: Props) {
  const { staffProfile, staffRole } = useStaffAuth()
  const [data, setData] = useState<SubscriberDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [legalHistory, setLegalHistory] = useState<LegalAcknowledgmentHistory[]>([])
  const [legalLoading, setLegalLoading] = useState(false)
  const [legalError, setLegalError] = useState<string | null>(null)
  const [legalLoaded, setLegalLoaded] = useState(false)

  const [overrideTier, setOverrideTier] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideLoading, setOverrideLoading] = useState(false)
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [overrideSuccess, setOverrideSuccess] = useState<string | null>(null)

  const [deactivateLoading, setDeactivateLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const [sessionLoading, setSessionLoading] = useState(false)
  const [activeSession, setActiveSession] = useState<{ id: string; startedAt: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getSubscriberDetail(userId)
      setData(res)
    } catch {
      setError('Failed to load subscriber details.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  const loadLegalHistory = useCallback(async () => {
    setLegalLoading(true)
    setLegalError(null)
    try {
      const res = await getSubscriberLegalHistory(userId)
      setLegalHistory(res.history)
      setLegalLoaded(true)
    } catch {
      setLegalError('Failed to load legal acknowledgment history.')
    } finally {
      setLegalLoading(false)
    }
  }, [userId])

  useEffect(() => { load() }, [load])

  const handleTierOverride = async () => {
    if (!overrideTier) { setOverrideError('Select a tier.'); return }
    setOverrideError(null)
    setOverrideSuccess(null)
    setOverrideLoading(true)
    try {
      await tierOverride(userId, overrideTier || null, overrideReason || 'Admin override')
      setOverrideSuccess(`Tier override set to ${overrideTier}.`)
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setOverrideError(err?.response?.data?.detail || 'Failed to update tier override.')
    } finally {
      setOverrideLoading(false)
    }
  }

  const handleClearOverride = async () => {
    setOverrideError(null)
    setOverrideSuccess(null)
    setOverrideLoading(true)
    try {
      await tierOverride(userId, null, 'Clear override')
      setOverrideSuccess('Tier override cleared.')
      await load()
    } catch {
      setOverrideError('Failed to clear tier override.')
    } finally {
      setOverrideLoading(false)
    }
  }

  const handleToggleActive = async () => {
    if (!data) return
    const isActive = data.profile.is_active
    if (!window.confirm(isActive ? 'Suspend this account?' : 'Reactivate this account?')) return
    setActionError(null)
    setActionSuccess(null)
    setDeactivateLoading(true)
    try {
      if (isActive) {
        await deactivateSubscriber(userId)
        setActionSuccess('Account suspended.')
      } else {
        await reactivateSubscriber(userId)
        setActionSuccess('Account reactivated.')
      }
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setActionError(err?.response?.data?.detail || 'Action failed.')
    } finally {
      setDeactivateLoading(false)
    }
  }

  const handleStartSession = async () => {
    setSessionLoading(true)
    setActionError(null)
    try {
      const res = await startSupportSession(userId)
      setActiveSession({ id: res.support_session_id, startedAt: res.started_at })
      // Reload to pick up the extended support view fields if available
      await load()
    } catch {
      setActionError('Failed to start support session.')
    } finally {
      setSessionLoading(false)
    }
  }

  const handleEndSession = async () => {
    if (!activeSession) return
    try {
      await endSupportSession(userId)
      setActiveSession(null)
    } catch {
      setActionError('Failed to end support session.')
    }
  }

  if (loading) {
    return <div style={{ color: C.muted, fontSize: '14px', padding: '40px', fontFamily: FONT }}>Loading subscriber...</div>
  }

  if (error || !data) {
    return (
      <div style={{ padding: '40px', fontFamily: FONT }}>
        <button onClick={onBack} style={backBtn}>Back</button>
        <div style={{ color: C.error, fontSize: '14px', marginTop: '16px' }}>{error || 'Not found.'}</div>
      </div>
    )
  }

  const { profile, subscription, positions_count, orders_count, invoices } = data
  const isOwner = staffRole === 'owner'
  const staffName = staffProfile?.full_name || staffProfile?.email || 'Staff'

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button onClick={onBack} style={backBtn}>Back</button>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: C.text }}>{profile.email}</h2>
        {!profile.is_active && (
          <span style={{ background: 'rgba(239,68,68,0.2)', color: C.error, padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>SUSPENDED</span>
        )}
        {subscription.admin_override_tier_key && (
          <span style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: C.warning, padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>
            OVERRIDE: {subscription.admin_override_tier_key.toUpperCase()}
          </span>
        )}
      </div>

      {actionError && <ErrorMsg msg={actionError} />}
      {actionSuccess && <SuccessMsg msg={actionSuccess} />}

      {/* Support view banner — shown when session is active */}
      {activeSession && (
        <div style={{
          background: 'rgba(245,158,11,0.15)',
          border: `2px solid ${C.supportBannerBorder}`,
          borderRadius: '10px',
          padding: '14px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: C.warning, marginBottom: '2px' }}>
              SUPPORT VIEW — read only
            </div>
            <div style={{ fontSize: '12px', color: C.muted }}>
              Viewing as {staffName} · Session started {fmtDate(activeSession.startedAt)} · All data is live, read-only
            </div>
          </div>
          <button
            onClick={handleEndSession}
            style={{ background: 'rgba(245,158,11,0.2)', border: `1px solid ${C.warning}`, borderRadius: '8px', color: C.warning, padding: '7px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}
          >
            End Session
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>

        {/* Profile */}
        <Section title="Profile">
          <Field label="Full name" value={profile.full_name || '—'} />
          <Field label="Account status" value={profile.is_active ? 'Active' : 'Suspended'} highlight={profile.is_active ? undefined : 'error'} />
          <Field label="Onboarding" value={profile.onboarding_completed ? 'Complete' : 'Incomplete'} />
          <Field label="Joined" value={fmtDate(profile.created_at)} />
          <Field label="Last seen" value={fmtDate(profile.last_seen_at)} />
        </Section>

        {/* Subscription */}
        <Section title="Subscription">
          {subscription.admin_override_tier_key ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '6px', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: C.warning, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Override active</span>
              <span style={{ fontSize: '12px', color: C.muted }}>Billing tier:</span>
              <span style={{ fontSize: '12px', color: C.muted, textDecoration: 'line-through' }}>{subscription.tier_key}</span>
              <span style={{ fontSize: '12px', color: C.muted }}>→</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: C.warning }}>{subscription.admin_override_tier_key}</span>
            </div>
          ) : null}
          <Field label="Tier" value={subscription.tier_key} />
          <Field label="Override tier" value={subscription.admin_override_tier_key || '—'} highlight={subscription.admin_override_tier_key ? 'warning' : undefined} />
          <Field label="Status" value={subscription.status} highlight={subscription.status === 'past_due' ? 'warning' : undefined} />
          <Field label="Period end" value={fmtDate(subscription.current_period_end)} />
          <Field label="Cancel at period end" value={subscription.cancel_at_period_end ? 'Yes' : 'No'} />
          <Field label="Stripe customer" value={subscription.stripe_customer_id ? subscription.stripe_customer_id.slice(-8) : '—'} />
        </Section>

        {/* Activity */}
        <Section title="Activity">
          <Field label="Positions" value={String(positions_count)} />
          <Field label="Orders" value={String(orders_count)} />
        </Section>
      </div>

      {/* Support Session */}
      <Section title="Support session (read-only view)">
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: C.muted, lineHeight: 1.6 }}>
          View this subscriber's data inline below. All data is read-only. Session is audit-logged.
        </p>
        {activeSession ? (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: C.success }}>Session active — scroll down to view subscriber data</span>
            <button onClick={handleEndSession} style={btnSecondary(false)}>End session</button>
          </div>
        ) : (
          <button onClick={handleStartSession} disabled={sessionLoading} style={btnPrimary(sessionLoading)}>
            {sessionLoading ? 'Starting...' : 'Start support session'}
          </button>
        )}
      </Section>

      {/* Inline support view — only shown when session is active */}
      {activeSession && (
        <>
          {/* Watchlist */}
          <Section title="Watchlist symbols">
            {data.watchlist_symbols && data.watchlist_symbols.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {data.watchlist_symbols.map(sym => (
                  <span key={sym} style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '4px 10px', fontSize: '13px', color: C.text, fontWeight: 600 }}>
                    {sym}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ color: C.muted, fontSize: '13px' }}>No watchlist symbols.</div>
            )}
          </Section>

          {/* Positions */}
          <Section title={`Open positions (${positions_count})`}>
            {data.positions && data.positions.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      {['Symbol', 'Qty', 'Avg Cost', 'Strategy', 'Opened'].map(h => (
                        <th key={h} style={{ textAlign: 'left', color: C.muted, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.positions.map((pos, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '8px', color: C.text, fontWeight: 600 }}>{pos.symbol}</td>
                        <td style={{ padding: '8px', color: C.text }}>{pos.quantity}</td>
                        <td style={{ padding: '8px', color: C.text }}>{pos.avg_cost != null ? `$${pos.avg_cost.toFixed(2)}` : '—'}</td>
                        <td style={{ padding: '8px', color: C.muted }}>{pos.strategy || '—'}</td>
                        <td style={{ padding: '8px', color: C.muted }}>{fmtDate(pos.opened_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: C.muted, fontSize: '13px' }}>No open positions.</div>
            )}
          </Section>

          {/* Recent orders */}
          <Section title={`Recent orders (last 20 of ${orders_count})`}>
            {data.orders && data.orders.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      {['Date', 'Symbol', 'Action', 'Qty', 'Price', 'Status'].map(h => (
                        <th key={h} style={{ textAlign: 'left', color: C.muted, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map(ord => (
                      <tr key={ord.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '8px', color: C.muted }}>{fmtDate(ord.timestamp)}</td>
                        <td style={{ padding: '8px', color: C.text, fontWeight: 600 }}>{ord.symbol}</td>
                        <td style={{ padding: '8px', color: C.text }}>{ord.action}</td>
                        <td style={{ padding: '8px', color: C.text }}>{ord.quantity}</td>
                        <td style={{ padding: '8px', color: C.text }}>${ord.price.toFixed(2)}</td>
                        <td style={{ padding: '8px', color: ord.status === 'filled' ? C.success : C.muted }}>{ord.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: C.muted, fontSize: '13px' }}>No recent orders.</div>
            )}
          </Section>
        </>
      )}

      {/* Tier override (owner only) */}
      {isOwner && (
        <Section title="Tier override (owner only)">
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: C.muted }}>
            Manually set the effective tier, bypassing Stripe. Does not affect billing.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <select
              value={overrideTier}
              onChange={e => setOverrideTier(e.target.value)}
              style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: '8px', color: C.text, padding: '8px 12px', fontSize: '13px', fontFamily: FONT }}
            >
              <option value="">Select tier...</option>
              {TIER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              type="text"
              placeholder="Reason (optional)"
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: '8px', color: C.text, padding: '8px 12px', fontSize: '13px', fontFamily: FONT, flex: 1, minWidth: '160px' }}
            />
          </div>
          {overrideError && <ErrorMsg msg={overrideError} />}
          {overrideSuccess && <SuccessMsg msg={overrideSuccess} />}
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
            <button onClick={handleTierOverride} disabled={overrideLoading} style={btnPrimary(overrideLoading)}>
              {overrideLoading ? 'Saving...' : 'Apply override'}
            </button>
            <button onClick={handleClearOverride} disabled={overrideLoading} style={btnSecondary(overrideLoading)}>
              Clear override
            </button>
          </div>
        </Section>
      )}

      {/* Account suspension (owner only) */}
      {isOwner && (
        <Section title={profile.is_active ? 'Suspend account' : 'Reactivate account'}>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: C.muted }}>
            {profile.is_active
              ? 'Suspending blocks all login access. Does not cancel their Stripe subscription.'
              : 'Reactivating restores login access.'}
          </p>
          <button
            onClick={handleToggleActive}
            disabled={deactivateLoading}
            style={{
              background: profile.is_active ? 'rgba(239,68,68,0.15)' : undefined,
              border: `1px solid ${profile.is_active ? C.error : C.border}`,
              borderRadius: '8px',
              color: profile.is_active ? C.error : C.text,
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: deactivateLoading ? 'not-allowed' : 'pointer',
              fontFamily: FONT,
            }}
          >
            {deactivateLoading ? 'Processing...' : profile.is_active ? 'Suspend account' : 'Reactivate account'}
          </button>
        </Section>
      )}

      {/* Invoices */}
      <Section title="Invoices">
        {invoices.length === 0 ? (
          <div style={{ color: C.muted, fontSize: '14px' }}>No invoices.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['Date', 'Amount', 'Status', 'PDF'].map(h => (
                    <th key={h} style={{ textAlign: 'left', color: C.muted, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px', color: C.muted }}>{fmtDate(inv.created_at)}</td>
                    <td style={{ padding: '8px', color: C.text }}>{fmtAmount(inv.amount_paid, inv.currency)}</td>
                    <td style={{ padding: '8px', color: inv.status === 'paid' ? C.success : C.warning }}>{inv.status}</td>
                    <td style={{ padding: '8px' }}>
                      {inv.invoice_pdf && <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: 'none', fontSize: '12px' }}>PDF</a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Legal History */}
      <Section title="Legal Acknowledgment History">
        {!legalLoaded ? (
          <div>
            <p style={{ margin: '0 0 12px', fontSize: '13px', color: C.muted, lineHeight: 1.6 }}>
              View the complete acknowledgment history for this subscriber.
            </p>
            <button
              onClick={loadLegalHistory}
              disabled={legalLoading}
              style={btnPrimary(legalLoading)}
            >
              {legalLoading ? 'Loading...' : 'Load legal history'}
            </button>
          </div>
        ) : legalError ? (
          <div>
            <ErrorMsg msg={legalError} />
            <button onClick={loadLegalHistory} disabled={legalLoading} style={btnSecondary(legalLoading)}>Retry</button>
          </div>
        ) : legalHistory.length === 0 ? (
          <div style={{ color: C.muted, fontSize: '13px' }}>No acknowledgments on record.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['Version', 'Acknowledged At', 'IP Address'].map(h => (
                    <th key={h} style={{ textAlign: 'left', color: C.muted, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {legalHistory.map(row => (
                  <tr key={row.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px', color: C.text, fontWeight: 600 }}>v{row.version_number}</td>
                    <td style={{ padding: '8px', color: C.muted, whiteSpace: 'nowrap' }}>
                      {new Date(row.acknowledged_at).toLocaleString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
                      })}
                    </td>
                    <td style={{ padding: '8px', color: C.muted }}>{row.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '20px', marginBottom: '16px' }}>
      <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: C.text }}>{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: 'warning' | 'error' }) {
  const color = highlight === 'warning' ? C.warning : highlight === 'error' ? C.error : C.text
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid rgba(45,49,72,0.5)`, gap: '12px' }}>
      <span style={{ fontSize: '13px', color: C.muted }}>{label}</span>
      <span style={{ fontSize: '13px', color, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return <div style={{ background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.error}`, borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: C.error, marginBottom: '12px' }}>{msg}</div>
}

function SuccessMsg({ msg }: { msg: string }) {
  return <div style={{ background: 'rgba(34,197,94,0.1)', border: `1px solid ${C.success}`, borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: C.success, marginBottom: '12px' }}>{msg}</div>
}

const backBtn: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${C.border}`,
  borderRadius: '6px',
  color: C.muted,
  padding: '5px 12px',
  fontSize: '13px',
  cursor: 'pointer',
  fontFamily: FONT,
}

const btnPrimary = (disabled: boolean): React.CSSProperties => ({
  background: C.accent,
  border: 'none',
  borderRadius: '8px',
  color: '#fff',
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.7 : 1,
  fontFamily: FONT,
})

const btnSecondary = (disabled: boolean): React.CSSProperties => ({
  background: 'transparent',
  border: `1px solid ${C.border}`,
  borderRadius: '8px',
  color: C.muted,
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.7 : 1,
  fontFamily: FONT,
})
