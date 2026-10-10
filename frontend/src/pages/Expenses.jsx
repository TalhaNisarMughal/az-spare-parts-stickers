import { Paperclip, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import api, { apiError, fmtDay, fmtMoney, toDayInput, todayISO, tzOffset, uploadFile } from '../api/client'
import DateField from '../components/DateField'
import FilePicker from '../components/FilePicker'
import { PRESETS } from '../components/ledgers/LedgerFilters'
import Modal from '../components/Modal'
import ReceiptModal from '../components/ReceiptModal'
import { useToast } from '../context/ToastContext'

function ExpenseForm({ initial, categories, onSaved, onCancel }) {
  const toast = useToast()
  const editing = Boolean(initial)
  const isCustom = initial && !categories.includes(initial.category)
  const [date, setDate] = useState(initial ? toDayInput(initial.expense_date) : todayISO())
  const [category, setCategory] = useState(initial ? (isCustom ? '__custom' : initial.category) : '')
  const [custom, setCustom] = useState(isCustom ? initial.category : '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [paidTo, setPaidTo] = useState(initial?.paid_to || '')
  const [note, setNote] = useState(initial?.note || '')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const cat = category === '__custom' ? custom.trim() : category
    if (!cat) return setError('Pick a category or type a new one.')
    const val = Number(amount)
    if (Number.isNaN(val) || val < 0 || amount === '') return setError('Enter the amount spent.')
    setBusy(true)
    try {
      const payload = { expense_date: date, category: cat, amount: val, paid_to: paidTo || null, note: note || null, tz_offset: tzOffset() }
      let saved
      if (editing) ({ data: saved } = await api.put(`/expenses/${initial.id}`, payload))
      else ({ data: saved } = await api.post('/expenses', payload))
      if (file) ({ data: saved } = await uploadFile(`/expenses/${saved.id}/receipt`, file))
      toast.success(editing ? 'Expense updated.' : 'Expense logged.')
      onSaved(saved)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="form-grid">
      {error && <div className="form-error-banner span-2">{error}</div>}
      <DateField label="Date" value={date} onChange={setDate} />
      <label className="field">
        <span>Amount (Rs) *</span>
        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus={!editing} />
      </label>
      <label className="field">
        <span>Category *</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">— Choose —</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value="__custom">+ New category…</option>
        </select>
      </label>
      {category === '__custom' ? (
        <label className="field">
          <span>New category name *</span>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Chai for customers" />
        </label>
      ) : (
        <label className="field">
          <span>Paid to</span>
          <input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="Optional — who received it" />
        </label>
      )}
      {category === '__custom' && (
        <label className="field">
          <span>Paid to</span>
          <input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="Optional — who received it" />
        </label>
      )}
      <label className={`field ${category === '__custom' ? '' : 'span-2'}`}>
        <span>Note</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional — what it was for" />
      </label>
      <div className="span-2">
        <FilePicker file={file} onChange={setFile} label={initial?.receipt ? 'Replace receipt (optional)' : 'Receipt (optional)'} />
      </div>
      <div className="form-actions span-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Log expense'}</button>
      </div>
    </form>
  )
}

export default function Expenses() {
  const toast = useToast()
  const [data, setData] = useState({ expenses: [], total: 0, count: 0, by_category: [] })
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [[dateFrom, dateTo], setRange] = useState(PRESETS.this_month())
  const [modal, setModal] = useState(null) // null | 'new' | expense
  const [receipt, setReceipt] = useState(null)

  const loadCategories = () => api.get('/expenses/categories').then(({ data }) => setCategories(data)).catch(() => {})

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/expenses', {
        params: { q: q || undefined, category: category || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined, tz_offset: tzOffset() },
      })
      setData(data)
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCategories() }, [])
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [q, category, dateFrom, dateTo]) // eslint-disable-line

  const refresh = () => { load(); loadCategories() }

  const remove = async (e) => {
    if (!window.confirm(`Delete this ${e.category} expense of ${fmtMoney(e.amount)}?`)) return
    try {
      await api.delete(`/expenses/${e.id}`)
      toast.success('Expense deleted.')
      refresh()
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  const applyPreset = (key) => setRange(key ? PRESETS[key]() : ['', ''])
  const filtersActive = q || category || dateFrom || dateTo
  const periodLabel = dateFrom || dateTo ? `${dateFrom ? fmtDay(dateFrom) : 'start'} → ${dateTo ? fmtDay(dateTo) : 'today'}` : 'all time'

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Expenses</h1>
          <p className="page-sub">Every rupee the business spends — rent, bills, transport, tea — so profit is the real picture.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}>
          <Plus size={16} /> Log Expense
        </button>
      </header>

      <div className="stat-grid">
        <div className="stat-card stat-card--amber">
          <span className="stat-label">Spent ({periodLabel})</span>
          <strong className="stat-value">{fmtMoney(data.total)}</strong>
          <span className="stat-sub">{data.count} expense(s)</span>
        </div>
        {data.by_category.slice(0, 3).map((c) => (
          <div key={c.category} className="stat-card">
            <span className="stat-label">{c.category}</span>
            <strong className="stat-value">{fmtMoney(c.amount)}</strong>
            <span className="stat-sub">{data.total > 0 ? `${((c.amount / data.total) * 100).toFixed(0)}% of spending` : ''}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-toolbar card-toolbar--filters">
          <div className="search-box">
            <Search size={15} />
            <input placeholder="Search category, paid to or note…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="filter-field">
            <span>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Quick range</span>
            <select value="" onChange={(e) => applyPreset(e.target.value)}>
              <option value="">Choose…</option>
              <option value="last_7">Last 7 days</option>
              <option value="this_month">This month</option>
              <option value="last_month">Last month</option>
              <option value="last_30">Last 30 days</option>
              <option value="this_year">This year</option>
              <option value="last_year">Last year</option>
            </select>
          </label>
          <label className="filter-field">
            <span>From</span>
            <input type="date" value={dateFrom} onChange={(e) => setRange([e.target.value, dateTo])} />
          </label>
          <label className="filter-field">
            <span>To</span>
            <input type="date" value={dateTo} onChange={(e) => setRange([dateFrom, e.target.value])} />
          </label>
          {filtersActive && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setCategory(''); setRange(['', '']) }}>
              <X size={14} /> Clear
            </button>
          )}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Paid To</th>
                <th>Note</th>
                <th className="th-num">Amount</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="empty-cell">Loading expenses…</td></tr>
              ) : data.expenses.length === 0 ? (
                <tr><td colSpan={6} className="empty-cell">{filtersActive ? 'No expenses match these filters.' : 'Nothing logged yet.'}</td></tr>
              ) : (
                <>
                  {data.expenses.map((e) => (
                    <tr key={e.id}>
                      <td className="td-muted">{fmtDay(e.expense_date)}</td>
                      <td><span className="cat-chip">{e.category}</span></td>
                      <td>{e.paid_to || '—'}</td>
                      <td className="td-muted">{e.note || '—'}</td>
                      <td className="td-num mono td-strong">{fmtMoney(e.amount)}</td>
                      <td className="td-actions">
                        <button className={`icon-btn ${e.receipt ? 'icon-btn--has' : ''}`} title={e.receipt ? 'View receipt' : 'Attach receipt'} onClick={() => setReceipt(e)}>
                          <Paperclip size={15} />
                        </button>
                        <button className="icon-btn" title="Edit" onClick={() => setModal(e)}><Pencil size={15} /></button>
                        <button className="icon-btn icon-btn--danger" title="Delete" onClick={() => remove(e)}><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  ))}
                  <tr className="ledger-total">
                    <td colSpan={4}>Total for {periodLabel}</td>
                    <td className="td-num mono">{fmtMoney(data.total)}</td>
                    <td />
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Log an expense' : 'Edit expense'} onClose={() => setModal(null)}>
          <ExpenseForm initial={modal === 'new' ? null : modal} categories={categories} onCancel={() => setModal(null)} onSaved={() => { setModal(null); refresh() }} />
        </Modal>
      )}
      {receipt && (
        <ReceiptModal
          title={`Expense receipt — ${receipt.category}`}
          subtitle={`${fmtDay(receipt.expense_date)} · ${fmtMoney(receipt.amount)}${receipt.paid_to ? ` · ${receipt.paid_to}` : ''}`}
          receipt={receipt.receipt}
          endpoint={`/expenses/${receipt.id}/receipt`}
          onChanged={(updated) => { setReceipt(updated); setData((d) => ({ ...d, expenses: d.expenses.map((x) => (x.id === updated.id ? updated : x)) })) }}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  )
}
