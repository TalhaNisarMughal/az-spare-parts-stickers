import { BookOpen, Boxes, Package, PackagePlus, Pencil, Plus, Search, Trash2, Truck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api, { apiError, fmtDay, fmtMoney, toDayInput, todayISO, tzOffset, uploadFile } from '../api/client'
import DateField from '../components/DateField'
import FilePicker from '../components/FilePicker'
import Modal from '../components/Modal'
import PurchaseForm from '../components/store/PurchaseForm'
import PurchasesTab from '../components/store/PurchasesTab'
import SupplierPicker, { EMPTY_SUPPLIER, supplierPayload, validateSupplier } from '../components/store/SupplierPicker'
import SuppliersTab from '../components/store/SuppliersTab'
import UploadWidget from '../components/UploadWidget'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const EMPTY = { stock_barcode: '', stock_name: '', qty: '', unit_price: '', cost_price: '' }

/**
 * Add / edit an item. For the admin, adding an item can also record where it
 * was bought (supplier, cost, what was paid) as the item's first purchase lot.
 */
function StockForm({ initial, suppliers, admin, onSaved, onCancel }) {
  const toast = useToast()
  const editing = Boolean(initial)
  const [form, setForm] = useState(
    initial
      ? { ...initial, qty: String(initial.qty), unit_price: String(initial.unit_price), cost_price: initial.cost_price == null ? '' : String(initial.cost_price) }
      : EMPTY
  )
  const [date, setDate] = useState(initial ? toDayInput(initial.created_at) : todayISO())
  const [withPurchase, setWithPurchase] = useState(admin && !editing)
  const [supplier, setSupplier] = useState({ mode: 'existing', supplier_id: '', new_supplier: EMPTY_SUPPLIER })
  const [paid, setPaid] = useState('0')
  const [pnote, setPnote] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const qtyNum = parseInt(form.qty, 10) || 0
  const costNum = Number(form.cost_price) || 0
  const priceNum = Number(form.unit_price) || 0
  const total = qtyNum * costNum
  const paidNum = Number(paid) || 0
  const remaining = Math.max(total - paidNum, 0)
  const margin = form.cost_price === '' ? null : priceNum - costNum

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const fe = {}
    if (!Number.isInteger(qtyNum) || qtyNum < 0 || form.qty === '') fe.qty = 'Qty must be a whole number of 0 or more.'
    if (Number.isNaN(Number(form.unit_price)) || priceNum < 0) fe.price = 'Selling price must be 0 or more.'
    if (admin && form.cost_price !== '' && (Number.isNaN(costNum) || costNum < 0)) fe.cost = 'Cost price must be 0 or more.'
    if (withPurchase) {
      const se = validateSupplier(supplier)
      if (se) fe.supplier = se
      if (qtyNum < 1) fe.qty = 'Qty must be at least 1 when recording a purchase.'
      if (form.cost_price === '') fe.cost = 'Enter the cost price you paid per unit.'
      if (paidNum < 0 || Number.isNaN(paidNum)) fe.paid = 'Paid amount must be 0 or more.'
      else if (paidNum > total) fe.paid = 'Paid amount cannot be more than the total cost.'
    }
    setFieldErrors(fe)
    if (Object.keys(fe).length) return

    setBusy(true)
    try {
      if (editing) {
        await api.put(`/stock/${encodeURIComponent(initial.stock_barcode)}`, {
          stock_name: form.stock_name,
          qty: qtyNum,
          unit_price: priceNum,
          cost_price: admin && form.cost_price !== '' ? costNum : null,
          created_date: date,
          tz_offset: tzOffset(),
        })
        toast.success('Stock item updated.')
      } else {
        const payload = {
          stock_barcode: form.stock_barcode,
          stock_name: form.stock_name,
          qty: qtyNum,
          unit_price: priceNum,
          created_date: date,
          tz_offset: tzOffset(),
        }
        if (admin && !withPurchase && form.cost_price !== '') payload.cost_price = costNum
        if (withPurchase) {
          payload.purchase = { ...supplierPayload(supplier), cost_price: costNum, paid_amount: paidNum, note: pnote || null }
        }
        const { data } = await api.post('/stock', payload)
        if (withPurchase && file) {
          // The item's first lot is its only purchase — attach the receipt to it.
          const { data: lots } = await api.get('/purchases', { params: { stock_barcode: data.stock_barcode } })
          if (lots[0]) await uploadFile(`/purchases/${lots[0].id}/receipt`, file)
        }
        toast.success(withPurchase ? 'Item and its purchase recorded.' : 'Stock item added.')
      }
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
        <span>Stock Barcode *</span>
        <input value={form.stock_barcode} onChange={set('stock_barcode')} disabled={editing} placeholder="BC-1001" required className="mono" />
        {editing && <small className="field-note">Barcode cannot be changed.</small>}
      </label>
      <label className="field">
        <span>Stock Name *</span>
        <input value={form.stock_name} onChange={set('stock_name')} placeholder="Tank Sticker — Honda 125" required />
      </label>
      <label className="field">
        <span>{editing ? 'Qty in store *' : withPurchase ? 'Qty bought *' : 'Opening Qty *'}</span>
        <input type="number" min="0" step="1" value={form.qty} onChange={set('qty')} required />
        {editing && initial.purchases > 0 && <small className="field-note">Prefer “Restock” to add units — it keeps the purchase record.</small>}
        {fieldErrors.qty && <span className="field-error">{fieldErrors.qty}</span>}
      </label>
      <label className="field">
        <span>Selling Price / Unit (Rs) *</span>
        <input type="number" min="0" step="0.01" value={form.unit_price} onChange={set('unit_price')} required />
        {fieldErrors.price && <span className="field-error">{fieldErrors.price}</span>}
      </label>
      <DateField label={editing ? 'Date added' : 'Date'} value={date} onChange={setDate} />

      {admin && (
        <label className="field">
          <span>Cost Price / Unit (Rs){withPurchase ? ' *' : ''}</span>
          <input type="number" min="0" step="0.01" value={form.cost_price} onChange={set('cost_price')} placeholder={withPurchase ? '' : 'Optional'} />
          {margin !== null && !Number.isNaN(margin) && (
            <small className={`field-note ${margin < 0 ? 'field-error' : ''}`}>
              Margin {fmtMoney(margin)} per unit{costNum > 0 ? ` (${((margin / costNum) * 100).toFixed(1)}%)` : ''}
            </small>
          )}
          {editing && initial.purchases > 0 && <small className="field-note">Average of {initial.purchases} purchase lot(s). Recalculated on every restock.</small>}
          {fieldErrors.cost && <span className="field-error">{fieldErrors.cost}</span>}
        </label>
      )}

      {admin && !editing && (
        <section className="bill-section span-2">
          <div className="bill-section-head">
            <h3 className="bill-section-title">Where did you buy it?</h3>
            <label className="switch">
              <input type="checkbox" checked={withPurchase} onChange={(e) => setWithPurchase(e.target.checked)} />
              <span>Record the purchase</span>
            </label>
          </div>
          {withPurchase ? (
            <div className="form-grid">
              <SupplierPicker suppliers={suppliers} value={supplier} onChange={setSupplier} error={fieldErrors.supplier} />
              <div className="totals-grid span-2">
                <div className="total-box">
                  <span>Total cost</span>
                  <strong className="mono">{fmtMoney(total)}</strong>
                  <small className="field-note">{qtyNum} × {fmtMoney(costNum)}</small>
                </div>
                <label className="field total-box">
                  <span>Paid now (Rs)</span>
                  <input type="number" min="0" step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} />
                  <small className="field-note">Can be 0 if bought on credit.</small>
                  {fieldErrors.paid && <span className="field-error">{fieldErrors.paid}</span>}
                </label>
                <div className={`total-box ${remaining > 0 ? 'total-box--due' : 'total-box--clear'}`}>
                  <span>Remaining to pay</span>
                  <strong className="mono">{fmtMoney(remaining)}</strong>
                </div>
              </div>
              <label className="field">
                <span>Note</span>
                <input value={pnote} onChange={(e) => setPnote(e.target.value)} placeholder="Optional — invoice no., remarks…" />
              </label>
              <FilePicker file={file} onChange={setFile} label="Purchase receipt (optional)" hint="Photo of the supplier's bill." />
            </div>
          ) : (
            <p className="field-note">Skipped — the item is added with its opening quantity only. You can “Restock” it later to record a purchase.</p>
          )}
        </section>
      )}

      <div className="form-actions span-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add to store'}
        </button>
      </div>
    </form>
  )
}

const TABS = [
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'purchases', label: 'Purchases', icon: Boxes },
  { key: 'suppliers', label: 'Suppliers', icon: Truck },
]

export default function Store() {
  const toast = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()
  const admin = user?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const tab = admin && TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'inventory'

  const [rows, setRows] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null) // null | 'new' | stock row
  const [restock, setRestock] = useState(null)

  const load = async (query = q) => {
    setLoading(true)
    try {
      const { data } = await api.get('/stock', { params: query ? { q: query } : {} })
      setRows(data)
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setLoading(false)
    }
  }

  const loadSuppliers = async () => {
    if (!admin) return
    try {
      const { data } = await api.get('/suppliers')
      setSuppliers(data)
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  useEffect(() => {
    load('')
    loadSuppliers()
  }, []) // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(() => load(q), 300)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line

  const refreshAll = () => {
    load()
    loadSuppliers()
  }

  const remove = async (s) => {
    if (!window.confirm(`Delete ${s.stock_name} (${s.stock_barcode}) from the store?`)) return
    try {
      await api.delete(`/stock/${encodeURIComponent(s.stock_barcode)}`)
      toast.success('Stock item deleted.')
      load()
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  const stockValue = admin ? rows.reduce((a, s) => a + (s.cost_price != null ? s.cost_price * s.qty : 0), 0) : 0
  const missingCost = admin ? rows.filter((s) => s.cost_price == null).length : 0

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Store</h1>
          <p className="page-sub">
            {admin
              ? 'Your inventory, every purchase you made, and the suppliers you buy from.'
              : 'Your inventory — every item, its quantity and selling price.'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}>
          <Plus size={16} /> Add Stock
        </button>
      </header>

      {admin && (
        <div className="segmented ledger-tabs">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setParams(t.key === 'inventory' ? {} : { tab: t.key })}>
                <Icon size={15} /> {t.label}
              </button>
            )
          })}
        </div>
      )}

      {tab === 'purchases' && <PurchasesTab suppliers={suppliers} onChanged={refreshAll} />}
      {tab === 'suppliers' && <SuppliersTab suppliers={suppliers} onChanged={loadSuppliers} />}

      {tab === 'inventory' && (
        <div className="card">
          <div className="card-toolbar">
            <div className="search-box">
              <Search size={15} />
              <input placeholder="Search by barcode or item name…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <UploadWidget base="/stock" entity="stock" onUploaded={() => load()} />
          </div>

          {admin && rows.length > 0 && (
            <div className="legend-row">
              <span>Stock value at cost: <b className="mono">{fmtMoney(stockValue)}</b></span>
              {missingCost > 0 && (
                <span className="amount-due">{missingCost} item(s) have no cost price yet — edit them to see profit.</span>
              )}
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Stock Barcode</th>
                  <th>Stock Name</th>
                  <th className="th-num">Qty in Store</th>
                  {admin && <th className="th-num">Cost / Unit</th>}
                  <th className="th-num">Selling Price</th>
                  {admin && <th className="th-num">Margin</th>}
                  <th>Date Added</th>
                  <th className="th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={admin ? 8 : 6} className="empty-cell">Loading inventory…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={admin ? 8 : 6} className="empty-cell">The store is empty. Add an item or upload the template.</td></tr>
                ) : (
                  rows.map((s) => (
                    <tr key={s.stock_barcode}>
                      <td className="mono">{s.stock_barcode}</td>
                      <td className="td-strong">{s.stock_name}</td>
                      <td className="td-num">
                        <span className={`qty-pill ${s.qty === 0 ? 'qty-out' : s.qty <= 5 ? 'qty-low' : ''}`}>
                          {s.qty}
                          {s.qty === 0 ? ' · out' : s.qty <= 5 ? ' · low' : ''}
                        </span>
                      </td>
                      {admin && (
                        <td className="td-num mono">
                          {s.cost_price == null ? <span className="td-muted">—</span> : fmtMoney(s.cost_price)}
                        </td>
                      )}
                      <td className="td-num mono">{fmtMoney(s.unit_price)}</td>
                      {admin && (
                        <td className={`td-num mono ${s.margin == null ? 'td-muted' : s.margin < 0 ? 'amount-due' : 'amount-clear'}`}>
                          {s.margin == null ? '—' : `${fmtMoney(s.margin)}${s.margin_percent != null ? ` (${s.margin_percent}%)` : ''}`}
                        </td>
                      )}
                      <td className="td-muted">{fmtDay(s.created_at)}</td>
                      <td className="td-actions">
                        {admin && (
                          <button className="icon-btn" title="Restock — record a new purchase" onClick={() => setRestock(s)}>
                            <PackagePlus size={15} />
                          </button>
                        )}
                        <button className="icon-btn" title="Open item ledger" onClick={() => navigate(`/ledgers?tab=item&id=${encodeURIComponent(s.stock_barcode)}`)}>
                          <BookOpen size={15} />
                        </button>
                        <button className="icon-btn" title="Edit" onClick={() => setModal(s)}>
                          <Pencil size={15} />
                        </button>
                        <button className="icon-btn icon-btn--danger" title="Delete" onClick={() => remove(s)}>
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <Modal
          title={modal === 'new' ? 'Add Stock' : `Edit ${modal.stock_name}`}
          subtitle={modal === 'new' ? 'Add the item and, if you like, where you bought it and what it cost.' : 'Fix anything that was entered wrong.'}
          onClose={() => setModal(null)}
          wide={admin && modal === 'new'}
        >
          <StockForm
            initial={modal === 'new' ? null : modal}
            suppliers={suppliers}
            admin={admin}
            onCancel={() => setModal(null)}
            onSaved={() => { setModal(null); refreshAll() }}
          />
        </Modal>
      )}

      {restock && (
        <Modal title={`Restock — ${restock.stock_name}`} subtitle="Record a new purchase lot. The quantity is added to the store and the average cost is updated." onClose={() => setRestock(null)}>
          <PurchaseForm item={restock} suppliers={suppliers} onCancel={() => setRestock(null)} onSaved={() => { setRestock(null); refreshAll() }} />
        </Modal>
      )}
    </div>
  )
}
