import { useEffect, useState, useCallback, useRef } from 'react'
import api from '../api/client'
import {
  getPublicConfig,
  patchAdminPlatformSettings,
  getHealthCheck,
  debugIvrFetch,
  getActivityLog,
  type HealthCheckResponse,
  type ComponentHealth,
  type ActivityLogResponse,
  type IvrFetchDebugResult,
  type ActivityLogFilters,
  type UserActionRow,
} from '../api/client'

type AdminTab = 'users' | 'whitelist' | 'activity' | 'leaderboard' | 'settings' | 'health' | 'user_actions'
type Role = 'user' | 'admin'

interface UserRow {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string
  is_active: boolean
  created_at: string
  cash: number | null
  last_login_at: string | null
  login_count_today: number
}

interface WhitelistRow {
  id: string
  email: string
  note: string | null
  added_at: string
}

interface ActivityRow {
  user_id: string
  email: string
  login_count: number
  last_login_at: string
  ip_address: string | null
  log_date: string
}

interface Stats {
  total_users: number
  active_today: number
  total_orders: number
  leaderboard: {
    user_id: string
    email: string | null
    full_name: string | null
    portfolio_value: number
    total_pnl: number
  }[]
}

const fmt = (v: number | null | undefined) =>
  v == null
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

const fmtTime = (ts: string | null) => {
  if (!ts) return '—'
  return new Date(ts).toLocaleString()
}

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<AdminTab>('users')
  const [users, setUsers] = useState<UserRow[]>([])
  const [whitelist, setWhitelist] = useState<WhitelistRow[]>([])
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newNote, setNewNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [loadingTab, setLoadingTab] = useState(false)

  // Invite user state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('user')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  // Role change in-flight tracker
  const [changingRole, setChangingRole] = useState<string | null>(null)

  // Platform settings
  const [aiEnabled, setAiEnabled] = useState(true)
  const [tradingDeskEnabled, setTradingDeskEnabled] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)

  const loadPlatformSettings = useCallback(async () => {
    try {
      const cfg = await getPublicConfig()
      setAiEnabled(cfg.ai_features_enabled)
      setTradingDeskEnabled(cfg.trading_desk_enabled)
    } catch {}
  }, [])

  useEffect(() => { loadPlatformSettings() }, [loadPlatformSettings])

  const handleToggleAI = async (enabled: boolean) => {
    setSavingSettings(true)
    try {
      await patchAdminPlatformSettings({ ai_features_enabled: enabled })
      setAiEnabled(enabled)
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to save setting.')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleToggleTradingDesk = async (enabled: boolean) => {
    setSavingSettings(true)
    try {
      await patchAdminPlatformSettings({ trading_desk_enabled: enabled })
      setTradingDeskEnabled(enabled)
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to save setting.')
    } finally {
      setSavingSettings(false)
    }
  }

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get<Stats>('/admin/stats')
      setStats(data)
    } catch (_) {}
  }, [])

  const loadUsers = useCallback(async () => {
    setLoadingTab(true)
    try {
      const { data } = await api.get<UserRow[]>('/admin/users')
      setUsers(data)
    } finally {
      setLoadingTab(false)
    }
  }, [])

  const loadWhitelist = useCallback(async () => {
    setLoadingTab(true)
    try {
      const { data } = await api.get<WhitelistRow[]>('/admin/whitelist')
      setWhitelist(data)
    } finally {
      setLoadingTab(false)
    }
  }, [])

  const loadActivity = useCallback(async () => {
    setLoadingTab(true)
    try {
      const { data } = await api.get<ActivityRow[]>('/admin/activity')
      setActivity(data)
    } finally {
      setLoadingTab(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    if (activeTab === 'users') loadUsers()
    else if (activeTab === 'whitelist') loadWhitelist()
    else if (activeTab === 'activity') loadActivity()
    else if (activeTab === 'leaderboard') loadStats()
    else if (activeTab === 'settings') loadPlatformSettings()
  }, [activeTab, loadUsers, loadWhitelist, loadActivity, loadStats, loadPlatformSettings])

  // Auto-refresh activity every 60s
  useEffect(() => {
    if (activeTab !== 'activity') return
    const id = setInterval(loadActivity, 60_000)
    return () => clearInterval(id)
  }, [activeTab, loadActivity])

  const handleAddWhitelist = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email) return
    setAdding(true)
    try {
      await api.post('/admin/whitelist', { email, note: newNote.trim() })
      setNewEmail('')
      setNewNote('')
      await loadWhitelist()
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to add email')
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveWhitelist = async (email: string) => {
    if (!confirm(`Remove ${email} from whitelist?`)) return
    await api.delete(`/admin/whitelist/${encodeURIComponent(email)}`)
    await loadWhitelist()
  }

  const handleDeactivate = async (userId: string, email: string) => {
    if (!confirm(`Deactivate user ${email}?`)) return
    await api.patch(`/admin/users/${userId}/deactivate`)
    await loadUsers()
  }

  const handleInviteUser = async () => {
    setInviteError('')
    setInviteSuccess('')
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    if (!email.endsWith('@gmail.com')) {
      setInviteError('Only @gmail.com addresses are accepted (Google auth only).')
      return
    }
    setInviting(true)
    try {
      await api.post('/admin/users/invite', { email, role: inviteRole })
      setInviteSuccess(`${email} invited as ${inviteRole}.`)
      setInviteEmail('')
      setInviteRole('user')
    } catch (e: any) {
      setInviteError(e?.response?.data?.detail || 'Failed to invite user.')
    } finally {
      setInviting(false)
    }
    // Refresh list separately — don't let this failure affect the invite result
    loadUsers().catch(() => {})
  }

  const handleRoleChange = async (userId: string, role: Role) => {
    setChangingRole(userId)
    try {
      await api.patch(`/admin/users/${userId}/role`, { role })
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to update role.')
    } finally {
      setChangingRole(null)
    }
  }

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'users',        label: 'Users' },
    { key: 'whitelist',    label: 'Whitelist' },
    { key: 'activity',     label: 'Activity Log (Logins)' },
    { key: 'leaderboard',  label: 'Leaderboard' },
    { key: 'settings',     label: 'Platform Settings' },
    { key: 'health',       label: 'Health' },
    { key: 'user_actions', label: 'User Actions' },
  ]

  return (
    <div style={s.root}>
      <h2 style={s.heading}>Admin Panel</h2>

      {/* Stat cards */}
      <div style={s.statRow}>
        <StatCard label="Total Users" value={stats?.total_users ?? '…'} />
        <StatCard label="Active Today" value={stats?.active_today ?? '…'} />
        <StatCard label="Total Orders" value={stats?.total_orders ?? '…'} />
      </div>

      {/* Tab bar */}
      <div style={s.tabBar}>
        {tabs.map(t => (
          <button
            key={t.key}
            style={s.tab(activeTab === t.key)}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={s.content}>
        {loadingTab && <p style={s.loading}>Loading…</p>}

        {/* USERS TAB */}
        {!loadingTab && activeTab === 'users' && (
          <div>
            {/* Invite user form */}
            <div style={s.inviteBox}>
              <div style={s.inviteTitle}>Add New User</div>
              <div style={s.addRow}>
                <input
                  style={s.input}
                  placeholder="someone@gmail.com"
                  value={inviteEmail}
                  onChange={e => { setInviteEmail(e.target.value); setInviteError(''); setInviteSuccess('') }}
                  onKeyDown={e => e.key === 'Enter' && handleInviteUser()}
                />
                <select
                  style={s.select}
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as Role)}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <button style={s.addBtn} onClick={handleInviteUser} disabled={inviting}>
                  {inviting ? 'Adding…' : '+ Add User'}
                </button>
              </div>
              {inviteError && <div style={s.inviteError}>{inviteError}</div>}
              {inviteSuccess && <div style={s.inviteSuccess}>{inviteSuccess}</div>}
            </div>

            {/* Users table */}
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Name', 'Email', 'Role', 'Cash', 'Last Login', "Today's Logins", 'Status', ''].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={s.tr}>
                      <td style={s.td}>{u.full_name || '—'}</td>
                      <td style={s.td}>{u.email}</td>
                      <td style={s.td}>
                        <select
                          style={s.roleSelect(u.role === 'admin')}
                          value={u.role}
                          disabled={changingRole === u.id}
                          onChange={e => handleRoleChange(u.id, e.target.value as Role)}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td style={s.td}>{fmt(u.cash)}</td>
                      <td style={s.td}>{fmtTime(u.last_login_at)}</td>
                      <td style={{ ...s.td, textAlign: 'center' }}>{u.login_count_today}</td>
                      <td style={s.td}>
                        <span style={u.is_active ? s.badgeActive : s.badgeInactive}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={s.td}>
                        {u.is_active && (
                          <button
                            style={s.deactivateBtn}
                            onClick={() => handleDeactivate(u.id, u.email)}
                          >
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={8} style={s.empty}>No users yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* WHITELIST TAB */}
        {!loadingTab && activeTab === 'whitelist' && (
          <div>
            <div style={s.addRow}>
              <input
                style={s.input}
                placeholder="user@example.com"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddWhitelist()}
              />
              <input
                style={{ ...s.input, width: '180px' }}
                placeholder="Note (optional)"
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
              />
              <button style={s.addBtn} onClick={handleAddWhitelist} disabled={adding}>
                {adding ? 'Adding…' : '+ Add'}
              </button>
            </div>
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Email', 'Note', 'Added At', ''].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {whitelist.map(w => (
                    <tr key={w.id} style={s.tr}>
                      <td style={s.td}>{w.email}</td>
                      <td style={s.td}>{w.note || '—'}</td>
                      <td style={s.td}>{fmtTime(w.added_at)}</td>
                      <td style={s.td}>
                        <button
                          style={s.removeBtn}
                          onClick={() => handleRemoveWhitelist(w.email)}
                        >
                          ✕ Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {whitelist.length === 0 && (
                    <tr><td colSpan={4} style={s.empty}>Whitelist is empty.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ACTIVITY LOG TAB */}
        {!loadingTab && activeTab === 'activity' && (
          <div>
            <p style={s.refreshNote}>Auto-refreshes every 60s</p>
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Email', 'Login Count', 'Last Login', 'IP Address'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activity.map((a, i) => (
                    <tr key={i} style={s.tr}>
                      <td style={s.td}>{a.email}</td>
                      <td style={{ ...s.td, textAlign: 'center' }}>{a.login_count}</td>
                      <td style={s.td}>{fmtTime(a.last_login_at)}</td>
                      <td style={s.td}>{a.ip_address || '—'}</td>
                    </tr>
                  ))}
                  {activity.length === 0 && (
                    <tr><td colSpan={4} style={s.empty}>No logins today.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* LEADERBOARD TAB */}
        {!loadingTab && activeTab === 'leaderboard' && (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Rank', 'Name / Email', 'Portfolio Value', 'Total P&L'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(stats?.leaderboard || []).map((entry, i) => {
                  const pnlColor = entry.total_pnl >= 0 ? '#22c55e' : '#ef4444'
                  return (
                    <tr key={entry.user_id} style={s.tr}>
                      <td style={{ ...s.td, textAlign: 'center', fontWeight: 700 }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </td>
                      <td style={s.td}>
                        <div style={{ fontWeight: 600 }}>{entry.full_name || '—'}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{entry.email}</div>
                      </td>
                      <td style={s.td}>{fmt(entry.portfolio_value)}</td>
                      <td style={{ ...s.td, color: pnlColor, fontWeight: 600 }}>
                        {entry.total_pnl >= 0 ? '+' : ''}{fmt(entry.total_pnl)}
                      </td>
                    </tr>
                  )
                })}
                {(stats?.leaderboard || []).length === 0 && (
                  <tr><td colSpan={4} style={s.empty}>No data yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* PLATFORM SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div style={{ maxWidth: '600px' }}>
            <h3 style={{ color: '#e2e8f0', fontSize: '16px', fontWeight: 600, margin: '0 0 20px' }}>Platform Settings</h3>
            <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: '10px', padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>AI Features Tab</div>
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>Show or hide the AI Features tab for all users.</div>
                </div>
                <button
                  onClick={() => handleToggleAI(!aiEnabled)}
                  disabled={savingSettings}
                  style={{
                    width: '44px', height: '24px', borderRadius: '12px', border: 'none',
                    background: aiEnabled ? '#7c6af7' : '#3a3f5c',
                    cursor: savingSettings ? 'not-allowed' : 'pointer',
                    position: 'relative', transition: 'background 0.2s',
                    flexShrink: 0, opacity: savingSettings ? 0.6 : 1,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: '3px',
                    left: aiEnabled ? '23px' : '3px',
                    width: '18px', height: '18px',
                    borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s',
                  }} />
                </button>
              </div>
              {savingSettings && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>Saving...</div>}
            </div>

            <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: '10px', padding: '20px 24px', marginTop: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>Trading Desk Tab</div>
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>Show or hide the Trading Desk workspace for all users.</div>
                </div>
                <button
                  onClick={() => handleToggleTradingDesk(!tradingDeskEnabled)}
                  disabled={savingSettings}
                  style={{
                    width: '44px', height: '24px', borderRadius: '12px', border: 'none',
                    background: tradingDeskEnabled ? '#7c6af7' : '#3a3f5c',
                    cursor: savingSettings ? 'not-allowed' : 'pointer',
                    position: 'relative', transition: 'background 0.2s',
                    flexShrink: 0, opacity: savingSettings ? 0.6 : 1,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: '3px',
                    left: tradingDeskEnabled ? '23px' : '3px',
                    width: '18px', height: '18px',
                    borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s',
                  }} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HEALTH TAB */}
        {activeTab === 'health' && <HealthTab />}

        {/* USER ACTIONS TAB */}
        {activeTab === 'user_actions' && <UserActionsTab />}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={s.statCard}>
      <div style={s.statValue}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  )
}

// ─── HealthTab ────────────────────────────────────────────────────────────────

const bannerConfig: Record<string, { label: string; color: string }> = {
  healthy:  { label: 'All Systems Operational', color: '#16a34a' },
  degraded: { label: 'Degraded',                color: '#d97706' },
  error:    { label: 'Outage Detected',          color: '#dc2626' },
}

const statusColor: Record<string, string> = {
  healthy:  '#16a34a',
  degraded: '#d97706',
  error:    '#dc2626',
}

function HealthTab() {
  const [healthData, setHealthData] = useState<HealthCheckResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const lastFetchRef = useRef<number>(0)
  const loadingRef = useRef(false)

  const fetchHealth = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && now - lastFetchRef.current < 30_000) return
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setFetchError(null)
    const t0 = Date.now()
    try {
      const data = await getHealthCheck()
      const apiRtt = Date.now() - t0
      data.components = data.components.map((c: ComponentHealth) =>
        c.name === 'Backend API' ? { ...c, response_time_ms: apiRtt } : c
      )
      setHealthData(data)
      lastFetchRef.current = Date.now()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setFetchError(e?.message ?? 'Health check failed: network error')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth(true)
    const id = setInterval(() => fetchHealth(false), 60_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ color: '#e2e8f0', fontSize: '16px', fontWeight: 600, margin: 0 }}>System Health</h3>
        <button
          onClick={() => fetchHealth(false)}
          disabled={loading}
          style={{
            background: loading ? '#2d3148' : '#7c6af7',
            border: 'none',
            borderRadius: '6px',
            color: loading ? '#64748b' : '#fff',
            padding: '7px 16px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: font,
          }}
        >
          {loading ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {/* Overall status banner — suppressed when a fresh-fetch error is active (stale data would be misleading) */}
      {healthData && !fetchError && (
        <div style={{
          background: `${bannerConfig[healthData.overall]?.color}22`,
          border: `1px solid ${bannerConfig[healthData.overall]?.color}66`,
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <span style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: bannerConfig[healthData.overall]?.color,
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: '14px',
            fontWeight: 700,
            color: bannerConfig[healthData.overall]?.color,
          }}>
            {bannerConfig[healthData.overall]?.label}
          </span>
          <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 'auto' }}>
            Last checked: {new Date(healthData.checked_at).toLocaleString()}
          </span>
        </div>
      )}

      {/* Error state */}
      {fetchError && (
        <div style={{
          background: 'rgba(220,38,38,0.1)',
          border: '1px solid rgba(220,38,38,0.4)',
          borderRadius: '8px',
          padding: '16px',
          color: '#ef4444',
          fontSize: '13px',
          marginBottom: '16px',
        }}>
          {fetchError}
        </div>
      )}

      {/* Loading state — shown only on first load (no data yet) */}
      {loading && !healthData && (
        <p style={{ color: '#64748b', fontSize: '13px', padding: '20px 0' }}>Checking components...</p>
      )}

      {/* Component cards — suppressed when error is active to avoid misleading stale state */}
      {healthData && !fetchError && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
          {healthData.components.map((c: ComponentHealth) => (
            <div key={c.name} style={{
              background: '#1a1d27',
              border: `1px solid ${statusColor[c.status] ?? '#2d3148'}44`,
              borderRadius: '10px',
              padding: '16px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>{c.name}</span>
                <span style={{
                  background: `${statusColor[c.status] ?? '#64748b'}22`,
                  color: statusColor[c.status] ?? '#64748b',
                  border: `1px solid ${statusColor[c.status] ?? '#64748b'}55`,
                  borderRadius: '12px',
                  padding: '2px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {c.status}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.6' }}>
                <div>
                  <span style={{ color: '#64748b' }}>Response: </span>
                  {c.response_time_ms != null ? `${c.response_time_ms} ms` : '—'}
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Checked: </span>
                  {new Date(c.checked_at).toLocaleTimeString()}
                </div>
                {c.detail && (
                  <div style={{ color: '#22c55e', marginTop: '6px', fontSize: '11px' }}>
                    {c.detail}
                  </div>
                )}
                {c.error && (
                  <div style={{ color: '#ef4444', marginTop: '6px', fontSize: '11px', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    {c.error.length > 200 ? c.error.slice(0, 197) + '...' : c.error}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <IvrDebugTool />
    </div>
  )
}

// ─── IvrDebugTool ─────────────────────────────────────────────────────────────

function IvrDebugTool() {
  const [symbol, setSymbol] = useState('AAPL')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<IvrFetchDebugResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (!symbol.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await debugIvrFetch(symbol.trim().toUpperCase())
      setResult(data)
    } catch (e: unknown) {
      const err = e as { message?: string }
      setError(err?.message ?? 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"
  const C = { bg: '#0f1117', surface: '#1a1d2e', border: '#2a2d3e', text: '#e2e8f0', muted: '#64748b', blue: '#38bdf8', green: '#4ade80', red: '#f87171', yellow: '#facc15' }

  return (
    <div style={{ fontFamily: font, marginTop: '32px', borderTop: `1px solid ${C.border}`, paddingTop: '24px' }}>
      <h4 style={{ color: C.text, fontSize: '14px', fontWeight: 600, margin: '0 0 12px' }}>
        IVR Source Diagnostic
      </h4>
      <p style={{ color: C.muted, fontSize: '12px', margin: '0 0 16px' }}>
        Tests the volradar.com fetch for a symbol and returns the raw HTTP status, response size, parsed IVR value, and first 2000 chars of HTML.
      </p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && run()}
          placeholder="AAPL"
          style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: '6px',
            color: C.text, padding: '7px 12px', fontSize: '13px', width: '120px',
            outline: 'none', fontFamily: font,
          }}
        />
        <button
          onClick={run}
          disabled={loading}
          style={{
            background: loading ? '#2d3148' : '#7c6af7', border: 'none', borderRadius: '6px',
            color: loading ? C.muted : '#fff', padding: '7px 18px', fontSize: '13px',
            cursor: loading ? 'not-allowed' : 'pointer', fontFamily: font,
          }}
        >
          {loading ? 'Fetching…' : 'Test Fetch'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#2d0f0f', border: `1px solid ${C.red}44`, borderRadius: '6px', padding: '10px 14px', color: C.red, fontSize: '12px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {result.error && (
            <div style={{ background: '#2d0f0f', border: `1px solid ${C.red}44`, borderRadius: '6px', padding: '10px 14px', color: C.red, fontSize: '12px' }}>
              {result.error}
            </div>
          )}
          {result.steps?.map((s, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '14px' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
                <span style={{ color: C.yellow, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>{s.step}</span>
                <span style={{ color: C.blue, fontSize: '11px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{s.url}</span>
              </div>
              {s.error ? (
                <div style={{ color: C.red, fontSize: '12px' }}>{s.error}</div>
              ) : (
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <div>
                    <div style={{ color: C.muted, fontSize: '10px', marginBottom: '2px' }}>HTTP STATUS</div>
                    <div style={{ color: s.status_code === 200 ? C.green : C.red, fontWeight: 700, fontSize: '14px' }}>{s.status_code}</div>
                  </div>
                  <div>
                    <div style={{ color: C.muted, fontSize: '10px', marginBottom: '2px' }}>CONTENT LENGTH</div>
                    <div style={{ color: C.text, fontWeight: 600, fontSize: '14px' }}>{s.content_length?.toLocaleString()} chars</div>
                  </div>
                  {s.cf_clearance_set !== undefined && (
                    <div>
                      <div style={{ color: C.muted, fontSize: '10px', marginBottom: '2px' }}>CF COOKIE</div>
                      <div style={{ color: s.cf_clearance_set ? C.green : C.red, fontWeight: 700, fontSize: '14px' }}>{s.cf_clearance_set ? 'Set ✓' : 'Missing'}</div>
                    </div>
                  )}
                </div>
              )}
              {s.parsed_json && (
                <details open>
                  <summary style={{ color: C.muted, fontSize: '11px', cursor: 'pointer', userSelect: 'none' }}>API response JSON</summary>
                  <pre style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '10px', marginTop: '8px', fontSize: '10px', color: C.green, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '300px', overflowY: 'auto' }}>
                    {JSON.stringify(s.parsed_json, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
          {result.production_fetch_result !== undefined && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '14px' }}>
              <div style={{ color: C.yellow, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '10px' }}>Production Result</div>
              {result.production_fetch_result === null
                ? <div style={{ color: C.red, fontSize: '13px' }}>null — fetch failed, fallback will be used</div>
                : <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    <div><div style={{ color: C.muted, fontSize: '10px' }}>IVR</div><div style={{ color: C.green, fontWeight: 700, fontSize: '18px' }}>{(result.production_fetch_result.iv_rank as number)?.toFixed(1)}</div></div>
                    <div><div style={{ color: C.muted, fontSize: '10px' }}>Current IV</div><div style={{ color: C.text, fontWeight: 600, fontSize: '14px' }}>{result.production_fetch_result.current_iv != null ? `${result.production_fetch_result.current_iv}%` : '—'}</div></div>
                  </div>
              }
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── UserActionsTab ───────────────────────────────────────────────────────────

const ACTION_TYPES = [
  'login',
  'logout',
  'ticker_search',
  'strategy_scan',
  'options_chain_view',
  'paper_trade_placed',
  'watchlist_update',
  'ai_query',
]

interface ActivityFilters {
  user_email: string
  action_type: string
  date_from: string
  date_to: string
}

function renderDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return ''
  const str = Object.entries(detail)
    .filter(([k]) => k !== 'legs')
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ')
  return str.length > 120 ? str.slice(0, 117) + '...' : str
}

function UserActionsTab() {
  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

  const [filters, setFilters] = useState<ActivityFilters>({
    user_email: '', action_type: '', date_from: '', date_to: '',
  })
  const [appliedFilters, setAppliedFilters] = useState<ActivityFilters>(filters)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ActivityLogResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)

  const fetchData = useCallback(async (f: ActivityFilters, p: number) => {
    setLoading(true)
    setFetchError(null)
    try {
      const apiFilters: ActivityLogFilters = {
        ...(f.user_email  ? { user_email:  f.user_email }  : {}),
        ...(f.action_type ? { action_type: f.action_type } : {}),
        ...(f.date_from   ? { date_from:   f.date_from }   : {}),
        ...(f.date_to     ? { date_to:     f.date_to }     : {}),
      }
      const result = await getActivityLog(apiFilters, p, 50)
      setData(result)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setFetchError(e?.message ?? 'Failed to load activity log')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(appliedFilters, page)
  }, [appliedFilters, page, fetchData])

  const handleApply = () => {
    setDateError(null)
    if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
      setDateError('date_from must not be after date_to')
      return
    }
    setAppliedFilters(filters)
    setPage(1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleApply()
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1
  const rangeStart = data && data.total > 0 ? (page - 1) * 50 + 1 : 0
  const rangeEnd   = data ? Math.min(page * 50, data.total) : 0

  return (
    <div style={{ fontFamily: font }}>
      <h3 style={{ color: '#e2e8f0', fontSize: '16px', fontWeight: 600, margin: '0 0 16px' }}>User Action Log</h3>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            User Email
          </label>
          <input
            style={s.input}
            placeholder="Filter by email..."
            value={filters.user_email}
            onChange={e => setFilters(f => ({ ...f, user_email: e.target.value }))}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Action Type
          </label>
          <select
            style={s.select}
            value={filters.action_type}
            onChange={e => setFilters(f => ({ ...f, action_type: e.target.value }))}
          >
            <option value="">All</option>
            {ACTION_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            From
          </label>
          <input
            type="date"
            style={s.input}
            value={filters.date_from}
            onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            To
          </label>
          <input
            type="date"
            style={s.input}
            value={filters.date_to}
            onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          style={{
            background: '#7c6af7',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            padding: '7px 16px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: font,
            alignSelf: 'flex-end',
          }}
          onClick={handleApply}
          disabled={loading}
        >
          Apply
        </button>
      </div>

      {/* Date validation error */}
      {dateError && (
        <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '8px' }}>{dateError}</div>
      )}

      {/* Fetch error */}
      {fetchError && (
        <div style={{
          background: 'rgba(220,38,38,0.1)',
          border: '1px solid rgba(220,38,38,0.4)',
          borderRadius: '8px',
          padding: '12px 16px',
          color: '#ef4444',
          fontSize: '13px',
          marginBottom: '12px',
        }}>
          {fetchError}
        </div>
      )}

      {/* Row count summary */}
      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
        {data && data.total === 0
          ? '0 events'
          : data
            ? `Showing ${rangeStart}–${rangeEnd} of ${data.total} results`
            : ''}
      </div>

      {/* Table */}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              {['Timestamp', 'User Email', 'Action Type', 'Detail', 'IP Address'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} style={{ ...s.empty, color: '#64748b' }}>Loading...</td>
              </tr>
            )}
            {!loading && data && data.results.length === 0 && (
              <tr>
                <td colSpan={5} style={s.empty}>No actions recorded matching the current filters.</td>
              </tr>
            )}
            {!loading && data && data.results.map((row: UserActionRow) => (
              <tr key={row.id} style={s.tr}>
                <td style={{ ...s.td, whiteSpace: 'nowrap', fontSize: '12px' }}>
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td style={{ ...s.td, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.user_email}
                </td>
                <td style={s.td}>
                  <span style={{
                    background: '#2d3148',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    whiteSpace: 'nowrap',
                  }}>
                    {row.action_type}
                  </span>
                </td>
                <td style={{ ...s.td, maxWidth: '300px', fontSize: '12px', color: '#94a3b8', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                  {renderDetail(row.detail)}
                </td>
                <td style={{ ...s.td, fontSize: '12px', color: '#64748b' }}>
                  {row.ip_address || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total > 50 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
          <button
            style={{
              background: 'transparent',
              border: '1px solid #3a3f5c',
              borderRadius: '6px',
              color: page === 1 ? '#3a3f5c' : '#94a3b8',
              padding: '5px 12px',
              fontSize: '13px',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              fontFamily: font,
            }}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>
            Page {page} of {totalPages}
          </span>
          <button
            style={{
              background: 'transparent',
              border: '1px solid #3a3f5c',
              borderRadius: '6px',
              color: page >= totalPages ? '#3a3f5c' : '#94a3b8',
              padding: '5px 12px',
              fontSize: '13px',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              fontFamily: font,
            }}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace"

const s: Record<string, any> = {
  root: {
    fontFamily: font,
    color: '#e2e8f0',
  },
  heading: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#7c6af7',
    margin: '0 0 20px 0',
  },
  statRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  statCard: {
    background: '#1a1d27',
    border: '1px solid #2d3148',
    borderRadius: '10px',
    padding: '14px 24px',
    minWidth: '120px',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#7c6af7',
  },
  statLabel: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '4px',
  },
  tabBar: {
    display: 'flex',
    gap: '4px',
    borderBottom: '1px solid #2d3148',
    marginBottom: '16px',
  },
  tab: (active: boolean) => ({
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    background: active ? '#252836' : 'transparent',
    color: active ? '#7c6af7' : '#94a3b8',
    borderRadius: '6px 6px 0 0',
    borderBottom: active ? '2px solid #7c6af7' : '2px solid transparent',
    fontFamily: font,
  }),
  content: {
    minHeight: '200px',
  },
  loading: {
    color: '#64748b',
    fontSize: '13px',
    padding: '20px 0',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    color: '#64748b',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #2d3148',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid #1e2130',
  },
  td: {
    padding: '10px 12px',
    color: '#e2e8f0',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
  },
  empty: {
    padding: '24px',
    color: '#475569',
    textAlign: 'center',
  },
  badgeActive: {
    background: 'rgba(34,197,94,0.12)',
    color: '#22c55e',
    padding: '2px 8px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 600,
  },
  badgeInactive: {
    background: 'rgba(239,68,68,0.12)',
    color: '#ef4444',
    padding: '2px 8px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 600,
  },
  addRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  input: {
    background: '#252836',
    border: '1px solid #3a3f5c',
    borderRadius: '6px',
    color: '#e2e8f0',
    padding: '7px 12px',
    fontSize: '13px',
    width: '240px',
    outline: 'none',
    fontFamily: font,
  },
  select: {
    background: '#252836',
    border: '1px solid #3a3f5c',
    borderRadius: '6px',
    color: '#e2e8f0',
    padding: '7px 10px',
    fontSize: '13px',
    outline: 'none',
    fontFamily: font,
    cursor: 'pointer',
  },
  roleSelect: (isAdmin: boolean) => ({
    background: 'transparent',
    border: `1px solid ${isAdmin ? '#7c6af744' : '#3a3f5c55'}`,
    borderRadius: '6px',
    color: isAdmin ? '#7c6af7' : '#94a3b8',
    padding: '3px 8px',
    fontSize: '12px',
    fontWeight: 600,
    outline: 'none',
    fontFamily: font,
    cursor: 'pointer',
  }),
  addBtn: {
    background: '#7c6af7',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    padding: '7px 16px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: font,
  },
  removeBtn: {
    background: 'transparent',
    border: '1px solid #ef444480',
    borderRadius: '6px',
    color: '#ef4444',
    padding: '3px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: font,
  },
  deactivateBtn: {
    background: 'transparent',
    border: '1px solid #f97316aa',
    borderRadius: '6px',
    color: '#f97316',
    padding: '3px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: font,
  },
  inviteBox: {
    background: '#1a1d27',
    border: '1px solid #2d3148',
    borderRadius: '10px',
    padding: '16px 20px',
    marginBottom: '20px',
  },
  inviteTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#7c6af7',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '12px',
  },
  inviteError: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#ef4444',
  },
  inviteSuccess: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#22c55e',
  },
  refreshNote: {
    fontSize: '11px',
    color: '#475569',
    marginBottom: '8px',
    marginTop: '0',
  },
}
