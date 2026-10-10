import { BookOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { apiError, fmtDay, fmtMoney } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import Modal from '../Modal'
import { EMPTY_SUPPLIER } from './SupplierPicker'

function SupplierForm({ initial, onSaved, onCancel }) {
  const toast = useToast()
  const editing = Boolean(initial)
  const [form, setForm] = useState(initial ? { name: initial.name, phone: initial.phone || '', address: initial.address || '', notes: initial.notes || '' } : EMPTY_SUPPLIER)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const payload = { name: form.name, phone: form.phone || null, address: form.address || null, notes: form.notes || null }
    try {
      if (editing) await api.put(`/suppliers/${initial.id}`, payload)
      else await api.post('/suppliers', payload)
      toast.success(editing ? 'Supplier updated.' : 'Supplier added.')
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
        <span>Supplier Name *</span>
        <input value={form.name} onChange={set('name')} placeholder="Person or company" required />
      </label>
      <label className="field">
        <span>Phone</span>
        <input value={form.phone} onChange={set('phone')} placeholder="Optional" />
      </label>
      <label className="field span-2">
        <span>Address</span>
        <input value={form.address} onChange={set('address')} placeholder="Optional" />
      </label>
      <label className="field span-2">
        <span>Notes</span>
        <input value={form.notes} onChange={set('notes')} placeholder="Optional — what they supply, terms…" />
      </label>
      <div className="form-actions span-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add supplier'}</button>
      </div>
    </form>
  )
}

/** Everyone the shop buys from, with what has been bought and what is still owed. */
export default function SuppliersTab({ suppliers, onChanged }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null) // null | 'new' | supplier

  const rows = useMemo(() => {
    const f = q.trim().toLowerCase()
    if (!f) return suppliers
    return suppliers.filter((s) => [s.name, s.phone, s.address, s.notes].some((v) => (v || '').toLowerCase().includes(f)))
  }, [suppliers, q])

  const remove = async (s) => {
    if (!window.confirm(`Delete supplier ${s.name}?`)) return
    try {
      await api.delete(`/suppliers/${s.id}`)
      toast.success('Supplier deleted.')
      onChanged()
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  const owed = suppliers.reduce((a, s) => a + (s.outstanding || 0), 0)

  return (
    <div className="card">
      <div className="card-toolbar">
        <div className="search-box">
          <Search size={15} />
          <input placeholder="Search suppliers…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="toolbar-right">
          {owed > 0 && <span className="td-muted">You owe suppliers <b className="amount-due mono">{fmtMoney(owed)}</b> in total</span>}
          <button className="btn btn-primary btn-sm" onClick={() => setModal('new')}>
            <Plus size={15} /> Add supplier
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Phone</th>
              <th>Address</th>
              <th className="th-num">Purchases</th>
              <th className="th-num">Total Bought</th>
              <th className="th-num">Paid</th>
              <th className="th-num">You Owe</th>
              <th>Last Purchase</th>
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="empty-cell">{q ? 'No suppliers match.' : 'No suppliers yet — they are added automatically when you record a purchase.'}</td></tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button className="link-btn td-strong" onClick={() => navigate(`/ledgers?tab=supplier&id=${s.id}`)}>{s.name}</button>
                    {s.notes && <div className="td-muted">{s.notes}</div>}
                  </td>
                  <td className="mono">{s.phone || '—'}</td>
                  <td className="td-muted">{s.address || '—'}</td>
                  <td className="td-num mono">{s.purchases}</td>
                  <td className="td-num mono">{fmtMoney(s.total_bought)}</td>
                  <td className="td-num mono">{fmtMoney(s.total_paid)}</td>
                  <td className={`td-num mono ${s.outstanding > 0 ? 'amount-due' : 'amount-clear'}`}>{fmtMoney(s.outstanding)}</td>
                  <td className="td-muted">{fmtDay(s.last_purchase)}</td>
                  <td className="td-actions">
                    <button className="icon-btn" title="Open supplier ledger" onClick={() => navigate(`/ledgers?tab=supplier&id=${s.id}`)}><BookOpen size={15} /></button>
                    <button className="icon-btn" title="Edit" onClick={() => setModal(s)}><Pencil size={15} /></button>
                    <button className="icon-btn icon-btn--danger" title="Delete" onClick={() => remove(s)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Add supplier' : `Edit ${modal.name}`} onClose={() => setModal(null)}>
          <SupplierForm initial={modal === 'new' ? null : modal} onCancel={() => setModal(null)} onSaved={() => { setModal(null); onChanged() }} />
        </Modal>
      )}
    </div>
  )
}
