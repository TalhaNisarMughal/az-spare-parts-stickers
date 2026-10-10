import { Camera, Check, KeyRound, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import api, { apiError, fmtDay, uploadFile } from '../api/client'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const ROLE_LABEL = { admin: 'Admin', user: 'Staff' }

// Mirrors the server's rules so people see what is missing while they type.
const RULES = [
  { key: 'len', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { key: 'upper', label: 'An uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'A lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { key: 'digit', label: 'A number (0–9)', test: (p) => /[0-9]/.test(p) },
  { key: 'special', label: 'A special character (! @ # $ % …)', test: (p) => /[^A-Za-z0-9]/.test(p) },
]
export const isStrong = (p) => RULES.every((r) => r.test(p))

function PasswordRules({ value }) {
  return (
    <ul className="pw-rules">
      {RULES.map((r) => {
        const ok = r.test(value)
        return (
          <li key={r.key} className={ok ? 'ok' : ''}>
            {ok ? <Check size={13} /> : <X size={13} />} {r.label}
          </li>
        )
      })}
    </ul>
  )
}

function PasswordInput({ value, onChange, label = 'New password *', autoComplete = 'new-password', showRules = true }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="password" value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} />
      {showRules && <PasswordRules value={value} />}
    </label>
  )
}

// ------------------------------------------------------------------ profile
function ProfileCard() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)
  const [name, setName] = useState(user?.full_name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data } = await api.put('/auth/me', { full_name: name, email })
      setUser(data)
      toast.success('Profile saved.')
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  const upload = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const { data } = await uploadFile('/auth/me/avatar', file)
      setUser(data)
      toast.success('Profile picture updated.')
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removePicture = async () => {
    setBusy(true)
    try {
      const { data } = await api.delete('/auth/me/avatar')
      setUser(data)
      toast.success('Profile picture removed.')
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card settings-card">
      <div className="card-title-row">
        <h2>My profile</h2>
        <span className={`role-badge role-${user?.role}`}>{ROLE_LABEL[user?.role]}</span>
      </div>
      <div className="profile-edit">
        <div className="profile-picture">
          <Avatar user={user} size={112} />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files[0])} />
          <div className="profile-picture-actions">
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Camera size={14} /> {user?.has_avatar ? 'Change picture' : 'Upload picture'}
            </button>
            {user?.has_avatar && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={removePicture}>
                <Trash2 size={14} /> Remove
              </button>
            )}
          </div>
          <small className="field-note">JPG or PNG. It is cropped to a square and shown at the top right.</small>
        </div>
        <form onSubmit={save} className="form-grid profile-form">
          {error && <div className="form-error-banner span-2">{error}</div>}
          <label className="field">
            <span>Your name *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Shown at the top right" />
          </label>
          <label className="field">
            <span>Email (used to sign in) *</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          </label>
          <div className="form-actions span-2">
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- password
function PasswordCard() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async (e) => {
    e.preventDefault()
    setError('')
    if (!isStrong(next)) return setError('The new password does not meet all the rules below.')
    if (next !== confirm) return setError('The two new passwords do not match.')
    setBusy(true)
    try {
      await api.post('/auth/me/password', { current_password: current, new_password: next })
      toast.success('Password changed.')
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card settings-card">
      <div className="card-title-row">
        <h2>Change password</h2>
      </div>
      <p className="ledger-note">
        Use a strong password: it protects every bill, ledger and figure in this system. Avoid names, phone numbers or
        simple words.
      </p>
      <form onSubmit={save} className="form-grid">
        {error && <div className="form-error-banner span-2">{error}</div>}
        <label className="field span-2">
          <span>Current password *</span>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </label>
        <PasswordInput value={next} onChange={setNext} />
        <label className="field">
          <span>Repeat new password *</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          {confirm && confirm !== next && <span className="field-error">Does not match.</span>}
        </label>
        <div className="form-actions span-2">
          <button className="btn btn-primary" disabled={busy || !current || !isStrong(next) || next !== confirm}>
            <KeyRound size={15} /> {busy ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  )
}

// -------------------------------------------------------------------- users
function UserForm({ initial, onSaved, onCancel }) {
  const toast = useToast()
  const editing = Boolean(initial)
  const [name, setName] = useState(initial?.full_name || '')
  const [email, setEmail] = useState(initial?.email || '')
  const [role, setRole] = useState(initial?.role || 'user')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!editing && !isStrong(password)) return setError('The password does not meet all the rules.')
    setBusy(true)
    try {
      if (editing) await api.put(`/users/${initial.id}`, { full_name: name, email, role })
      else await api.post('/users', { full_name: name, email, role, password })
      toast.success(editing ? 'Account updated.' : `Account created for ${name}.`)
      onSaved()
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="form-grid">
      {error && <div className="form-error-banner span-2">{error}</div>}
      <label className="field">
        <span>Name *</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="field">
        <span>Email *</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field span-2">
        <span>Role *</span>
        <div className="radio-row">
          <label className={`radio-pill ${role === 'user' ? 'active' : ''}`}>
            <input type="radio" checked={role === 'user'} onChange={() => setRole('user')} /> Staff
          </label>
          <label className={`radio-pill ${role === 'admin' ? 'active' : ''}`}>
            <input type="radio" checked={role === 'admin'} onChange={() => setRole('admin')} /> Admin
          </label>
        </div>
        <small className="field-note">
          {role === 'admin'
            ? 'Admin sees everything: dashboard, profit, cost prices, purchases, suppliers, expenses, and can manage accounts.'
            : 'Staff can work with customers, store quantities and selling prices, bills and ledgers — never costs, profit, purchases or expenses.'}
        </small>
      </label>
      {!editing && (
        <div className="span-2">
          <PasswordInput value={password} onChange={setPassword} label="Password for this person *" />
        </div>
      )}
      <div className="form-actions span-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create account'}</button>
      </div>
    </form>
  )
}

function ResetPasswordForm({ target, onSaved, onCancel }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!isStrong(password)) return setError('The password does not meet all the rules.')
    setBusy(true)
    try {
      await api.post(`/users/${target.id}/password`, { new_password: password })
      toast.success(`Password reset for ${target.full_name || target.email}.`)
      onSaved()
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="form-grid">
      {error && <div className="form-error-banner span-2">{error}</div>}
      <div className="span-2">
        <PasswordInput value={password} onChange={setPassword} />
      </div>
      <div className="form-actions span-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !isStrong(password)}>{busy ? 'Saving…' : 'Set password'}</button>
      </div>
    </form>
  )
}

function UsersCard() {
  const { user: me } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | {kind:'new'} | {kind:'edit', user} | {kind:'reset', user}

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/users')
      setRows(data)
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  const remove = async (u) => {
    if (!window.confirm(`Remove the account for ${u.full_name || u.email}? They will no longer be able to sign in.`)) return
    try {
      await api.delete(`/users/${u.id}`)
      toast.success('Account removed.')
      load()
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  return (
    <div className="card settings-card">
      <div className="card-title-row">
        <div>
          <h2>People who can sign in</h2>
          <p className="page-sub">Add staff or another admin. Staff never see finances.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'new' })}>
          <UserPlus size={15} /> Add person
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Email</th>
              <th>Role</th>
              <th>Added</th>
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="empty-cell">Loading accounts…</td></tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="user-cell">
                      <Avatar user={u} size={34} />
                      <span>
                        <strong>{u.full_name || '—'}</strong>
                        {u.id === me?.id && <span className="td-muted"> (you)</span>}
                      </span>
                    </span>
                  </td>
                  <td className="mono">{u.email}</td>
                  <td><span className={`role-badge role-${u.role}`}>{ROLE_LABEL[u.role]}</span></td>
                  <td className="td-muted">{fmtDay(u.created_at)}</td>
                  <td className="td-actions">
                    <button className="icon-btn" title="Edit name, email or role" onClick={() => setModal({ kind: 'edit', user: u })}><Pencil size={15} /></button>
                    <button className="icon-btn" title="Reset password" onClick={() => setModal({ kind: 'reset', user: u })}><KeyRound size={15} /></button>
                    <button className="icon-btn icon-btn--danger" title="Remove account" disabled={u.id === me?.id} onClick={() => remove(u)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal?.kind === 'new' && (
        <Modal title="Add a person" subtitle="They sign in with this email and password." onClose={() => setModal(null)}>
          <UserForm onCancel={() => setModal(null)} onSaved={() => { setModal(null); load() }} />
        </Modal>
      )}
      {modal?.kind === 'edit' && (
        <Modal title={`Edit ${modal.user.full_name || modal.user.email}`} onClose={() => setModal(null)}>
          <UserForm initial={modal.user} onCancel={() => setModal(null)} onSaved={() => { setModal(null); load() }} />
        </Modal>
      )}
      {modal?.kind === 'reset' && (
        <Modal title={`Reset password — ${modal.user.full_name || modal.user.email}`} subtitle="Tell them the new password; they can change it later in Settings." onClose={() => setModal(null)}>
          <ResetPasswordForm target={modal.user} onCancel={() => setModal(null)} onSaved={() => setModal(null)} />
        </Modal>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { user } = useAuth()
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="page-sub">Your profile and password{user?.role === 'admin' ? ', and who else can sign in.' : '.'}</p>
        </div>
      </header>
      <div className="settings-grid">
        <ProfileCard />
        <PasswordCard />
      </div>
      {user?.role === 'admin' && <UsersCard />}
    </div>
  )
}
