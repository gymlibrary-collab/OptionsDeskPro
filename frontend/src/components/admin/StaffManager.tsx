import { useEffect, useState, useCallback } from 'react'
import { getStaffList, inviteStaff, changeStaffRole, deactivateStaff, StaffMember } from '../../api/client'

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

const ROLE_OPTIONS = ['support', 'finance', 'owner']

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function StaffManager() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('support')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [showInviteForm, setShowInviteForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getStaffList()
      setStaff(res.staff)
    } catch {
      setError('Failed to load staff list.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteError(null)
    if (!inviteEmail.trim()) { setInviteError('Email is required.'); return }
    setInviteLoading(true)
    try {
      await inviteStaff({ email: inviteEmail.trim(), staff_role: inviteRole, full_name: inviteName.trim() })
      setActionMsg(`Invitation sent to ${inviteEmail}.`)
      setInviteEmail('')
      setInviteName('')
      setInviteRole('support')
      setShowInviteForm(false)
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string; code?: string } } }
      if (err?.response?.data?.code === 'email_is_subscriber') {
        setInviteError('This email belongs to an existing subscriber and cannot be added as staff.')
      } else {
        setInviteError(err?.response?.data?.detail || 'Invitation failed. Please retry.')
      }
    } finally {
      setInviteLoading(false)
    }
  }

  const handleRoleChange = async (member: StaffMember, newRole: string) => {
    setActionError(null)
    setActionMsg(null)
    try {
      await changeStaffRole(member.id, newRole)
      setActionMsg(`Role updated for ${member.email}.`)
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setActionError(err?.response?.data?.detail || 'Failed to change role.')
    }
  }

  const handleDeactivate = async (member: StaffMember) => {
    if (!window.confirm(`Deactivate ${member.email}? They will lose admin portal access.`)) return
    setActionError(null)
    setActionMsg(null)
    try {
      await deactivateStaff(member.id)
      setActionMsg(`${member.email} deactivated.`)
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setActionError(err?.response?.data?.detail || 'Failed to deactivate staff.')
    }
  }

  if (loading) return <div style={{ color: C.muted, fontSize: '14px', fontFamily: FONT }}>Loading staff...</div>
  if (error) return <div style={{ color: C.error, fontSize: '14px', fontFamily: FONT }}>{error}</div>

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: C.text }}>Staff Manager</h2>
        <button
          onClick={() => { setShowInviteForm(v => !v); setInviteError(null) }}
          style={{ background: C.accent, border: 'none', borderRadius: '8px', color: '#fff', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}
        >
          {showInviteForm ? 'Cancel' : '+ Invite staff'}
        </button>
      </div>

      {actionMsg && <div style={{ background: 'rgba(34,197,94,0.1)', border: `1px solid ${C.success}`, borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: C.success, marginBottom: '14px' }}>{actionMsg}</div>}
      {actionError && <div style={{ background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.error}`, borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: C.error, marginBottom: '14px' }}>{actionError}</div>}

      {showInviteForm && (
        <div style={{ background: C.surface, border: `1px solid ${C.accent}`, borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: C.text }}>Invite new staff member</h3>
          <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              disabled={inviteLoading}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="Full name (optional)"
              value={inviteName}
              onChange={e => setInviteName(e.target.value)}
              disabled={inviteLoading}
              style={inputStyle}
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              disabled={inviteLoading}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
            {inviteError && <div style={{ background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.error}`, borderRadius: '8px', padding: '10px', fontSize: '13px', color: C.error }}>{inviteError}</div>}
            <button
              type="submit"
              disabled={inviteLoading}
              style={{ background: C.accent, border: 'none', borderRadius: '8px', color: '#fff', padding: '9px', fontSize: '13px', fontWeight: 600, cursor: inviteLoading ? 'not-allowed' : 'pointer', opacity: inviteLoading ? 0.7 : 1, fontFamily: FONT }}
            >
              {inviteLoading ? 'Sending...' : 'Send invitation'}
            </button>
          </form>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: C.surface }}>
              {['Email', 'Name', 'Role', 'Status', 'Last seen', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', color: C.muted, fontWeight: 600, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map(member => (
              <tr key={member.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '10px 12px', color: C.text }}>{member.email}</td>
                <td style={{ padding: '10px 12px', color: C.muted }}>{member.full_name || '—'}</td>
                <td style={{ padding: '10px 12px' }}>
                  <select
                    value={member.staff_role}
                    onChange={e => handleRoleChange(member, e.target.value)}
                    style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: '6px', color: C.text, padding: '4px 8px', fontSize: '12px', fontFamily: FONT, cursor: 'pointer' }}
                  >
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ color: member.is_active ? C.success : C.error, fontWeight: 600 }}>
                    {member.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', color: C.muted, whiteSpace: 'nowrap' }}>{fmtDate(member.last_seen_at)}</td>
                <td style={{ padding: '10px 12px' }}>
                  {member.is_active && (
                    <button
                      onClick={() => handleDeactivate(member)}
                      style={{ background: 'transparent', border: `1px solid ${C.error}`, borderRadius: '6px', color: C.error, padding: '3px 10px', fontSize: '12px', cursor: 'pointer', fontFamily: FONT }}
                    >
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: C.input,
  border: `1px solid ${C.border}`,
  borderRadius: '8px',
  color: C.text,
  padding: '9px 12px',
  fontSize: '13px',
  fontFamily: FONT,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}
