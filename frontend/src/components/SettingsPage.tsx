import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useEntitlements } from '../context/EntitlementsContext'
import { useWindowSize } from '../hooks/useWindowSize'
import {
  getBillingInvoices,
  getPaymentMethod,
  createBillingPortalSession,
  cancelSubscription,
  reactivateSubscription,
  downgradePlan,
  deleteAccount,
  Invoice,
  PaymentMethod,
} from '../api/client'
import { supabase } from '../lib/supabase'

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

type SettingsTab = 'account' | 'subscription' | 'billing' | 'danger'

interface Props {
  onClose?: () => void
  onUpgradeClick?: () => void
}

// Fallback tier labels used only when entitlements don't supply display_name/price_monthly_usd
const TIER_LABELS_FALLBACK: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const fmtAmount = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount)

export default function SettingsPage({ onClose, onUpgradeClick }: Props) {
  const { user, profile, signOut, refreshEntitlements } = useAuth()
  const { entitlements } = useEntitlements()
  const { isMobile } = useWindowSize()
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'account', label: 'Account' },
    { key: 'subscription', label: 'Subscription' },
    { key: 'billing', label: 'Billing' },
    { key: 'danger', label: 'Danger Zone' },
  ]

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: isMobile ? '12px' : '16px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '6px', color: C.muted, padding: '5px 12px', fontSize: '13px', cursor: 'pointer', fontFamily: FONT }}
          >
            Back
          </button>
        )}
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: C.text }}>Settings</h1>
      </div>

      <div style={{ display: 'flex', gap: '2px', padding: isMobile ? '6px 8px 0' : '8px 16px 0', background: C.surface, borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: isMobile ? '7px 12px' : '8px 18px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === t.key ? C.bg : 'transparent',
              color: activeTab === t.key ? (t.key === 'danger' ? C.error : C.accent) : C.muted,
              borderRadius: '6px 6px 0 0',
              borderTop: activeTab === t.key ? `2px solid ${t.key === 'danger' ? C.error : C.accent}` : '2px solid transparent',
              fontFamily: FONT,
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: isMobile ? '16px 12px' : '24px', maxWidth: '720px' }}>
        {activeTab === 'account' && <AccountTab user={user} profile={profile} />}
        {activeTab === 'subscription' && <SubscriptionTab entitlements={entitlements} onUpgradeClick={onUpgradeClick} refreshEntitlements={refreshEntitlements} />}
        {activeTab === 'billing' && <BillingTab />}
        {activeTab === 'danger' && <DangerTab signOut={signOut} />}
      </div>
    </div>
  )
}

// ─── Account Tab ─────────────────────────────────────────────────────────────────────────────────

function AccountTab({ user, profile }: { user: ReturnType<typeof useAuth>['user']; profile: ReturnType<typeof useAuth>['profile'] }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError(null)
    setPwSuccess(false)
    if (newPassword.length < 8) { setPwError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirmPw) { setPwError('Passwords do not match.'); return }
    setPwLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwLoading(false)
    if (error) { setPwError(error.message); return }
    setPwSuccess(true)
    setNewPassword('')
    setConfirmPw('')
  }

  const displayName = (profile as unknown as { full_name?: string })?.full_name || user?.email || '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <Section title="Profile">
        <Field label="Name" value={displayName} />
        <Field label="Email" value={user?.email || '—'} />
        <Field label="Auth provider" value={user?.app_metadata?.provider || 'email'} />
      </Section>

      <Section title="Change Password">
        <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            disabled={pwLoading}
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            disabled={pwLoading}
            style={inputStyle}
          />
          {pwError && <ErrorMsg msg={pwError} />}
          {pwSuccess && <SuccessMsg msg="Password updated successfully." />}
          <button type="submit" disabled={pwLoading} style={btnPrimary(pwLoading)}>
            {pwLoading ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </Section>
    </div>
  )
}

// ─── Subscription Tab ────────────────────────────────────────────────────────────────────────────

function SubscriptionTab({
  entitlements,
  onUpgradeClick,
  refreshEntitlements,
}: {
  entitlements: ReturnType<typeof useEntitlements>['entitlements']
  onUpgradeClick?: () => void
  refreshEntitlements: () => Promise<void>
}) {
  const [cancelLoading, setCancelLoading] = useState(false)
  const [reactivateLoading, setReactivateLoading] = useState(false)
  const [downgradeLoading, setDowngradeLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Typed-confirmation cancel flow (F-004)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelConfirmText, setCancelConfirmText] = useState('')

  // Downgrade confirmation (F-001)
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState(false)
  const [downgradeConfirmText, setDowngradeConfirmText] = useState('')

  const handleCancelConfirm = async () => {
    if (cancelConfirmText !== 'CANCEL') return
    setActionError(null)
    setActionSuccess(null)
    setCancelLoading(true)
    try {
      const res = await cancelSubscription('CANCEL')
      setActionSuccess(`Subscription will cancel on ${fmtDate(res.cancels_at)}.`)
      setShowCancelConfirm(false)
      setCancelConfirmText('')
      await refreshEntitlements()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setActionError(err?.response?.data?.detail || 'Failed to cancel. Please try again.')
    } finally {
      setCancelLoading(false)
    }
  }

  const handleDowngrade = async () => {
    if (downgradeConfirmText !== 'DOWNGRADE') return
    setActionError(null)
    setActionSuccess(null)
    setDowngradeLoading(true)
    try {
      const res = await downgradePlan('starter')
      setActionSuccess(`Downgrade to Starter takes effect on ${fmtDate(res.effective_until)}.`)
      setShowDowngradeConfirm(false)
      setDowngradeConfirmText('')
      await refreshEntitlements()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setActionError(err?.response?.data?.detail || 'Failed to schedule downgrade. Please try again.')
    } finally {
      setDowngradeLoading(false)
    }
  }

  const handleReactivate = async () => {
    setActionError(null)
    setActionSuccess(null)
    setReactivateLoading(true)
    try {
      await reactivateSubscription()
      setActionSuccess('Subscription reactivated successfully.')
      await refreshEntitlements()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setActionError(err?.response?.data?.detail || 'Failed to reactivate. Please try again.')
    } finally {
      setReactivateLoading(false)
    }
  }

  if (!entitlements) {
    return <div style={{ color: C.muted, fontSize: '14px' }}>Loading subscription details...</div>
  }

  const tier = entitlements.effective_tier
  const status = entitlements.subscription_status
  const cancelAtPeriodEnd = entitlements.cancel_at_period_end

  // F-012: use display_name and price_monthly_usd from entitlements if available
  const tierLabel = entitlements.display_name
    ? (entitlements.price_monthly_usd != null && entitlements.price_monthly_usd > 0
        ? `${entitlements.display_name} ($${entitlements.price_monthly_usd}/mo)`
        : entitlements.display_name)
    : (TIER_LABELS_FALLBACK[tier] ?? tier)

  const pendingTierLabel = entitlements.pending_tier_key
    ? (TIER_LABELS_FALLBACK[entitlements.pending_tier_key] ?? entitlements.pending_tier_key)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {actionError && <ErrorMsg msg={actionError} />}
      {actionSuccess && <SuccessMsg msg={actionSuccess} />}

      <Section title="Current subscription">
        <Field label="Plan" value={tierLabel} />
        <Field label="Status" value={status === 'active' ? (cancelAtPeriodEnd ? 'Cancels at period end' : 'Active') : status} highlight={status === 'past_due' ? 'warning' : undefined} />
        {entitlements.current_period_end && (
          <Field label={cancelAtPeriodEnd ? 'Access until' : 'Next renewal'} value={fmtDate(entitlements.current_period_end)} />
        )}
        {entitlements.pending_tier_key && entitlements.current_period_end && (
          <Field
            label="Scheduled change"
            value={`Downgrade to ${pendingTierLabel} on ${fmtDate(entitlements.current_period_end)}`}
            highlight="warning"
          />
        )}
        <Field label="Max watchlist symbols" value={entitlements.max_symbols === null ? 'Unlimited' : String(entitlements.max_symbols)} />
        <Field label="Max scans/month" value={entitlements.max_scans_per_month === null ? 'Unlimited' : String(entitlements.max_scans_per_month)} />
      </Section>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {tier !== 'enterprise' && tier !== 'pro' && (
          <button onClick={onUpgradeClick} style={btnPrimary(false)}>
            Upgrade plan
          </button>
        )}
        {tier === 'pro' && !entitlements.pending_tier_key && (
          <>
            <button onClick={onUpgradeClick} style={btnPrimary(false)}>
              Upgrade plan
            </button>
            <button
              onClick={() => { setShowDowngradeConfirm(true); setDowngradeConfirmText('') }}
              style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '8px', color: C.muted, padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}
            >
              Downgrade to Starter
            </button>
          </>
        )}
        {cancelAtPeriodEnd ? (
          <button
            onClick={handleReactivate}
            disabled={reactivateLoading}
            style={btnPrimary(reactivateLoading)}
          >
            {reactivateLoading ? 'Reactivating...' : 'Reactivate subscription'}
          </button>
        ) : (
          tier !== 'free' && (
            <button
              onClick={() => { setShowCancelConfirm(true); setCancelConfirmText('') }}
              style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '8px', color: C.muted, padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}
            >
              Cancel subscription
            </button>
          )
        )}
      </div>

      {/* Inline typed-confirmation cancel (F-004) */}
      {showCancelConfirm && (
        <Section title="Confirm cancellation">
          <p style={{ margin: '0 0 14px', fontSize: '13px', color: C.muted, lineHeight: 1.7 }}>
            Your subscription will remain active until the end of the current billing period.
            Type <strong style={{ color: C.text }}>CANCEL</strong> to confirm:
          </p>
          <input
            type="text"
            value={cancelConfirmText}
            onChange={e => setCancelConfirmText(e.target.value)}
            placeholder="CANCEL"
            disabled={cancelLoading}
            style={{ ...inputStyle, marginBottom: '12px' }}
          />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleCancelConfirm}
              disabled={cancelLoading || cancelConfirmText !== 'CANCEL'}
              style={{
                background: cancelConfirmText === 'CANCEL' ? C.error : 'rgba(239,68,68,0.3)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                padding: '9px 18px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: (cancelLoading || cancelConfirmText !== 'CANCEL') ? 'not-allowed' : 'pointer',
                opacity: cancelConfirmText !== 'CANCEL' ? 0.5 : 1,
                fontFamily: FONT,
              }}
            >
              {cancelLoading ? 'Cancelling...' : 'Confirm cancellation'}
            </button>
            <button
              onClick={() => { setShowCancelConfirm(false); setCancelConfirmText('') }}
              disabled={cancelLoading}
              style={btnSecondary(cancelLoading)}
            >
              Back
            </button>
          </div>
        </Section>
      )}

      {/* Inline typed-confirmation downgrade (F-001) */}
      {showDowngradeConfirm && (
        <Section title="Confirm downgrade to Starter">
          <p style={{ margin: '0 0 14px', fontSize: '13px', color: C.muted, lineHeight: 1.7 }}>
            You will keep Pro access until {fmtDate(entitlements.current_period_end)}, then switch to Starter.
            Type <strong style={{ color: C.text }}>DOWNGRADE</strong> to confirm:
          </p>
          <input
            type="text"
            value={downgradeConfirmText}
            onChange={e => setDowngradeConfirmText(e.target.value)}
            placeholder="DOWNGRADE"
            disabled={downgradeLoading}
            style={{ ...inputStyle, marginBottom: '12px' }}
          />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleDowngrade}
              disabled={downgradeLoading || downgradeConfirmText !== 'DOWNGRADE'}
              style={{
                background: C.warning,
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                padding: '9px 18px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: (downgradeLoading || downgradeConfirmText !== 'DOWNGRADE') ? 'not-allowed' : 'pointer',
                opacity: downgradeConfirmText !== 'DOWNGRADE' ? 0.5 : 1,
                fontFamily: FONT,
              }}
            >
              {downgradeLoading ? 'Scheduling...' : 'Confirm downgrade'}
            </button>
            <button
              onClick={() => { setShowDowngradeConfirm(false); setDowngradeConfirmText('') }}
              disabled={downgradeLoading}
              style={btnSecondary(downgradeLoading)}
            >
              Back
            </button>
          </div>
        </Section>
      )}
    </div>
  )
}

// ─── Billing Tab ──────────────────────────────────────────────────────────────────────────────────

function BillingTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const { isMobile } = useWindowSize()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [invRes, pmRes] = await Promise.all([getBillingInvoices(), getPaymentMethod()])
      setInvoices(invRes.invoices)
      setPaymentMethod(pmRes)
    } catch {
      setError('Unable to load billing information.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handlePortal = async () => {
    setPortalError(null)
    setPortalLoading(true)
    try {
      const { portal_url } = await createBillingPortalSession()
      window.location.href = portal_url
    } catch {
      setPortalError('Unable to open billing portal. Please try again.')
      setPortalLoading(false)
    }
  }

  if (loading) return <div style={{ color: C.muted, fontSize: '14px' }}>Loading billing...</div>
  if (error) return <ErrorMsg msg={error} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {portalError && <ErrorMsg msg={portalError} />}

      <Section title="Payment method">
        {paymentMethod?.last4 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ fontSize: '14px', color: C.text }}>
              {paymentMethod.brand?.toUpperCase()} ending in {paymentMethod.last4} — expires {paymentMethod.exp_month}/{paymentMethod.exp_year}
              {paymentMethod.stale && <span style={{ color: C.warning, marginLeft: '8px', fontSize: '12px' }}>(may be stale)</span>}
            </span>
            <button onClick={handlePortal} disabled={portalLoading} style={btnSecondary(portalLoading)}>
              {portalLoading ? 'Opening...' : 'Manage in Stripe'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ fontSize: '14px', color: C.muted }}>No payment method on file.</span>
            <button onClick={handlePortal} disabled={portalLoading} style={btnSecondary(portalLoading)}>
              {portalLoading ? 'Opening...' : 'Add card in Stripe'}
            </button>
          </div>
        )}
      </Section>

      <Section title="Invoices">
        {invoices.length === 0 ? (
          <div style={{ color: C.muted, fontSize: '14px' }}>No invoices yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['Date', 'Amount', 'Status', isMobile ? '' : 'Period', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', color: C.muted, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ padding: '8px', color: C.muted }}>{fmtDate(inv.created_at)}</td>
                    <td style={{ padding: '8px', color: C.text, fontWeight: 600 }}>{fmtAmount(inv.amount_paid, inv.currency)}</td>
                    <td style={{ padding: '8px' }}>
                      <span style={{ color: inv.status === 'paid' ? C.success : C.warning, fontWeight: 600 }}>{inv.status}</span>
                    </td>
                    {!isMobile && <td style={{ padding: '8px', color: C.muted }}>{fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}</td>}
                    <td style={{ padding: '8px' }}>
                      {inv.invoice_pdf && (
                        <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer" style={{ color: C.accent, fontSize: '12px', textDecoration: 'none' }}>PDF</a>
                      )}
                    </td>
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

// ─── Danger Zone Tab ─────────────────────────────────────────────────────────────────────────────

function DangerTab({ signOut }: { signOut: () => Promise<void> }) {
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm.')
      return
    }
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteAccount('DELETE')
      await signOut()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      const detail = err?.response?.data?.detail || 'Deletion failed. Please contact support.'
      setDeleteError(detail)
      setDeleting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <Section title="Delete account">
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: C.muted, lineHeight: 1.7 }}>
          This permanently deletes your account and all data. Your Stripe subscription will be cancelled immediately. This action cannot be undone.
        </p>
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            style={{ background: 'rgba(239,68,68,0.15)', border: `1px solid ${C.error}`, borderRadius: '8px', color: C.error, padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}
          >
            Delete my account
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: C.error, fontWeight: 600 }}>
              Type DELETE to confirm account deletion:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="DELETE"
              disabled={deleting}
              style={{ ...inputStyle, borderColor: C.error }}
            />
            {deleteError && <ErrorMsg msg={deleteError} />}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleDelete}
                disabled={deleting || confirmText !== 'DELETE'}
                style={{ background: deleting ? 'rgba(239,68,68,0.3)' : C.error, border: 'none', borderRadius: '8px', color: '#fff', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: FONT, opacity: confirmText !== 'DELETE' ? 0.5 : 1 }}
              >
                {deleting ? 'Deleting...' : 'Confirm delete'}
              </button>
              <button
                onClick={() => { setShowConfirm(false); setConfirmText(''); setDeleteError(null) }}
                disabled={deleting}
                style={btnSecondary(deleting)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>
    </div>
  )
}

// ─── Shared components ───────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '20px' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: C.text }}>{title}</h3>
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
  return (
    <div style={{ background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.error}`, borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: C.error }}>
      {msg}
    </div>
  )
}

function SuccessMsg({ msg }: { msg: string }) {
  return (
    <div style={{ background: 'rgba(34,197,94,0.1)', border: `1px solid ${C.success}`, borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: C.success }}>
      {msg}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: C.input,
  border: `1px solid ${C.border}`,
  borderRadius: '8px',
  color: C.text,
  padding: '10px 12px',
  fontSize: '14px',
  fontFamily: FONT,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const btnPrimary = (disabled: boolean): React.CSSProperties => ({
  background: C.accent,
  border: 'none',
  borderRadius: '8px',
  color: '#fff',
  padding: '9px 18px',
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
  padding: '9px 18px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.7 : 1,
  fontFamily: FONT,
})
