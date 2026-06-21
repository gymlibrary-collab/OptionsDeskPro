import { useState, useEffect, useCallback } from 'react'
import { StaffAuthProvider, useStaffAuth } from '../../context/StaffAuthContext'
import StaffLoginPage from './StaffLoginPage'
import SubscriberList from './SubscriberList'
import SubscriberDetail from './SubscriberDetail'
import PricingManager from './PricingManager'
import RevenuePanel from './RevenuePanel'
import HealthPanel from './HealthPanel'
import FaqEditor from './FaqEditor'
import StaffManager from './StaffManager'
import LegalVersionManager from './LegalVersionManager'
import { useWindowSize } from '../../hooks/useWindowSize'
import { getPlatformSettings, patchPlatformSettings, PlatformSettings } from '../../api/client'

const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
  input: '#252836',
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

type Section = 'dashboard' | 'subscribers' | 'pricing' | 'revenue' | 'health' | 'faq' | 'staff' | 'settings' | 'legal'

function AdminShell() {
  const { staffUser, staffProfile, staffRole, loading, signOut } = useStaffAuth()
  const { isMobile } = useWindowSize()
  const [activeSection, setActiveSection] = useState<Section>('dashboard')
  const [selectedSubscriberId, setSelectedSubscriberId] = useState<string | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg, color: C.accent, fontSize: '16px', fontFamily: FONT }}>
        Loading admin portal...
      </div>
    )
  }

  if (!staffUser || !staffProfile) {
    return <StaffLoginPage />
  }

  type NavItem = { key: Section; label: string; roles?: ('owner' | 'support' | 'finance')[] }

  const allNavItems: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'subscribers', label: 'Subscribers', roles: ['owner', 'support'] },
    { key: 'pricing', label: 'Pricing', roles: ['owner', 'finance'] },
    { key: 'revenue', label: 'Revenue', roles: ['owner', 'finance'] },
    { key: 'health', label: 'Health', roles: ['owner'] },
    { key: 'faq', label: 'FAQ Editor', roles: ['owner', 'support'] },
    { key: 'legal', label: 'Legal', roles: ['owner', 'support', 'finance'] },
    { key: 'staff', label: 'Staff', roles: ['owner'] },
    { key: 'settings', label: 'Settings', roles: ['owner'] },
  ]
  const navItems = allNavItems.filter(item => !item.roles || (staffRole && item.roles.includes(staffRole as 'owner' | 'support' | 'finance')))

  const handleNav = (section: Section) => {
    setActiveSection(section)
    setSelectedSubscriberId(null)
    setMobileNavOpen(false)
  }

  const initials = (staffProfile.full_name || staffProfile.email || '?')
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const navContent = (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '12px 8px' }}>
      {navItems.map(item => (
        <button
          key={item.key}
          onClick={() => handleNav(item.key)}
          style={{
            background: activeSection === item.key ? C.accent : 'transparent',
            border: 'none',
            borderRadius: '8px',
            color: activeSection === item.key ? '#fff' : C.muted,
            padding: '10px 14px',
            textAlign: 'left',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: FONT,
          }}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, fontFamily: FONT }}>
      {/* Top bar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: isMobile ? '10px 12px' : '10px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        {isMobile && (
          <button
            onClick={() => setMobileNavOpen(v => !v)}
            style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '6px', color: C.muted, padding: '5px 10px', cursor: 'pointer', fontFamily: FONT, fontSize: '16px' }}
          >
            ☰
          </button>
        )}
        <span style={{ fontSize: '18px', color: C.accent }}>⬡</span>
        <span style={{ fontSize: '15px', fontWeight: 700, color: C.text }}>
          {isMobile ? 'Admin' : 'Options Compass Admin Portal'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff' }}>
            {initials}
          </div>
          {!isMobile && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', color: C.text, fontWeight: 600 }}>{staffProfile.full_name || staffProfile.email}</span>
              <span style={{ fontSize: '11px', color: C.muted, textTransform: 'capitalize' }}>{staffProfile.staff_role}</span>
            </div>
          )}
          <button
            onClick={signOut}
            style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '6px', color: C.muted, padding: '4px 10px', fontSize: '12px', cursor: 'pointer', fontFamily: FONT }}
          >
            Sign out
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar nav — desktop */}
        {!isMobile && (
          <div style={{ width: '200px', flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`, overflowY: 'auto' }}>
            {navContent}
          </div>
        )}

        {/* Mobile nav drawer */}
        {isMobile && mobileNavOpen && (
          <>
            <div onClick={() => setMobileNavOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
            <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: '220px', background: C.surface, borderRight: `1px solid ${C.border}`, zIndex: 201, overflowY: 'auto' }}>
              <div style={{ padding: '16px 12px', borderBottom: `1px solid ${C.border}`, fontSize: '15px', fontWeight: 700, color: C.text }}>Admin Portal</div>
              {navContent}
            </div>
          </>
        )}

        {/* Main content */}
        <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px 12px' : '24px' }}>
          {activeSection === 'dashboard' && <DashboardSection onNavigate={handleNav} staffRole={staffRole} />}
          {activeSection === 'subscribers' && (
            selectedSubscriberId
              ? <SubscriberDetail userId={selectedSubscriberId} onBack={() => setSelectedSubscriberId(null)} />
              : <SubscriberList onSelectSubscriber={id => setSelectedSubscriberId(id)} />
          )}
          {activeSection === 'pricing' && <PricingManager staffRole={staffRole} />}
          {activeSection === 'revenue' && <RevenuePanel />}
          {activeSection === 'health' && <HealthPanel />}
          {activeSection === 'faq' && <FaqEditor />}
          {activeSection === 'legal' && <LegalVersionManager staffRole={staffRole} />}
          {activeSection === 'staff' && <StaffManager />}
          {activeSection === 'settings' && <PlatformSettingsPanel />}
        </div>
      </div>
    </div>
  )
}

function DashboardSection({
  onNavigate,
  staffRole,
}: {
  onNavigate: (s: Section) => void
  staffRole: string | null
}) {
  type Shortcut = { key: Section; label: string; desc: string; roles?: string[] }
  const allShortcuts: Shortcut[] = [
    { key: 'subscribers', label: 'Subscribers', desc: 'View and manage subscriber accounts', roles: ['owner', 'support'] },
    { key: 'pricing', label: 'Pricing', desc: 'View and edit tier prices and entitlements', roles: ['owner', 'finance'] },
    { key: 'revenue', label: 'Revenue', desc: 'MRR, subscriber counts, churn', roles: ['owner', 'finance'] },
    { key: 'health', label: 'Health', desc: 'API status, market data source, active sessions', roles: ['owner'] },
    { key: 'faq', label: 'FAQ Editor', desc: 'Create and publish FAQ articles', roles: ['owner', 'support'] },
    { key: 'legal', label: 'Legal', desc: 'Manage legal document versions and view subscriber acknowledgment history', roles: ['owner', 'support', 'finance'] },
    { key: 'staff', label: 'Staff', desc: 'Invite staff, manage roles', roles: ['owner'] },
    { key: 'settings', label: 'Settings', desc: 'Platform settings: invite-only mode, maintenance mode', roles: ['owner'] },
  ]
  const shortcuts = allShortcuts.filter(s => !s.roles || (staffRole && s.roles.includes(staffRole)))

  return (
    <div>
      <h2 style={{ margin: '0 0 20px', fontSize: '20px', fontWeight: 700, color: C.text }}>Dashboard</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {shortcuts.map(s => (
          <button
            key={s.key}
            onClick={() => onNavigate(s.key)}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '20px', textAlign: 'left', cursor: 'pointer', fontFamily: FONT }}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, color: C.text, marginBottom: '6px' }}>{s.label}</div>
            <div style={{ fontSize: '13px', color: C.muted, lineHeight: 1.5 }}>{s.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Platform Settings Panel ──────────────────────────────────────────────────────────────────────

function PlatformSettingsPanel() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getPlatformSettings()
      setSettings(res)
    } catch {
      setError('Failed to load platform settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggle = async (field: keyof PlatformSettings) => {
    if (!settings) return
    const newValue = !settings[field]
    setSaveError(null)
    setSaveSuccess(null)
    setSaving(true)
    try {
      await patchPlatformSettings({ [field]: newValue })
      setSettings(s => s ? { ...s, [field]: newValue } : s)
      setSaveSuccess(`${field === 'invite_only_mode' ? 'Invite-only mode' : 'Maintenance mode'} ${newValue ? 'enabled' : 'disabled'}.`)
    } catch {
      setSaveError('Failed to update settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: C.muted, fontSize: '14px', fontFamily: FONT }}>Loading settings...</div>
  if (error || !settings) return <div style={{ color: '#ef4444', fontSize: '14px', fontFamily: FONT }}>{error || 'Unable to load settings.'}</div>

  return (
    <div style={{ fontFamily: FONT }}>
      <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: C.text }}>Platform Settings</h2>

      {saveSuccess && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#22c55e', marginBottom: '16px' }}>
          {saveSuccess}
        </div>
      )}
      {saveError && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#ef4444', marginBottom: '16px' }}>
          {saveError}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <ToggleSetting
          label="Invite-only mode"
          description="When enabled, only whitelisted email addresses can create new accounts. New public sign-ups are blocked."
          enabled={settings.invite_only_mode}
          onToggle={() => handleToggle('invite_only_mode')}
          disabled={saving}
        />
        <ToggleSetting
          label="Maintenance mode"
          description="When enabled, the client portal displays a maintenance page. Existing sessions are unaffected."
          enabled={settings.maintenance_mode}
          onToggle={() => handleToggle('maintenance_mode')}
          disabled={saving}
        />
      </div>
    </div>
  )
}

function ToggleSetting({ label, description, enabled, onToggle, disabled }: {
  label: string
  description: string
  enabled: boolean
  onToggle: () => void
  disabled: boolean
}) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: C.text, marginBottom: '4px' }}>{label}</div>
        <div style={{ fontSize: '13px', color: C.muted, lineHeight: 1.6 }}>{description}</div>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        style={{
          flexShrink: 0,
          width: '48px',
          height: '26px',
          borderRadius: '13px',
          border: 'none',
          background: enabled ? '#7c6af7' : '#2d3148',
          cursor: disabled ? 'not-allowed' : 'pointer',
          position: 'relative',
          opacity: disabled ? 0.7 : 1,
          transition: 'background 0.2s',
        }}
        aria-label={`${label}: ${enabled ? 'on' : 'off'}`}
      >
        <span style={{
          position: 'absolute',
          top: '3px',
          left: enabled ? '25px' : '3px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
        }} />
      </button>
    </div>
  )
}

export default function AdminApp() {
  return (
    <StaffAuthProvider>
      <AdminAppInner />
    </StaffAuthProvider>
  )
}

function AdminAppInner() {
  const { staffUser, staffProfile, loading } = useStaffAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg, color: C.accent, fontSize: '16px', fontFamily: FONT }}>
        Loading...
      </div>
    )
  }

  if (!staffUser || !staffProfile) {
    return <StaffLoginPage />
  }

  return <AdminShell />
}
