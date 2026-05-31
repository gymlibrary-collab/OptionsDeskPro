import { useEffect, useState, useCallback } from 'react'
import api from '../api/client'

type AdminTab = 'users' | 'whitelist' | 'activity' | 'leaderboard'
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
  }, [activeTab, loadUsers, loadWhitelist, loadActivity, loadStats])

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
      setInviteSuccess(`${email} added as ${inviteRole}.`)
      setInviteEmail('')
      setInviteRole('user')
      await loadUsers()
    } catch (e: any) {
      setInviteError(e?.response?.data?.detail || 'Failed to invite user.')
    } finally {
      setInviting(false)
    }
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
    { key: 'users', label: 'Users' },
    { key: 'whitelist', label: 'Whitelist' },
    { key: 'activity', label: 'Activity Log' },
    { key: 'leaderboard', label: 'Leaderboard' },
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
