import { useState } from 'react'
import api, { apiError, fmtMoney, toDayInput, todayISO, tzOffset, uploadFile } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import DateField from '../DateField'
import FilePicker from '../FilePicker'
import SupplierPicker, { EMPTY_SUPPLIER, supplierPayload, validateSupplier } from './SupplierPicker'

/**
 * Restock an existing item (new purchase lot) or edit an existing purchase.
 *
 * `item`     — the stock row being restocked (create mode)
 * `purchase` — the purchase being edited (edit mode)
 */
export default function PurchaseForm({ item, purchase, suppliers, onSaved, onCancel }) {
  const toast = useToast()
  const editing = Boolean(purchase)
  const [supplier, setSupplier] = useState({
    mode: 'existing',
    supplier_id: purchase ? String(purchase.supplier_id) : '',
    new_supplier: EMPTY_SUPPLIER,
  })
  const [qty, setQty] = useState(purchase ? String(purchase.qty) : '')
  const [cost, setCost] = useState(purchase ? String(purchase.cost_price) : '')
  const [paid, setPaid] = useState('0')
  const [date, setDate] = useState(purchase ? toDayInput(purchase.purchase_date) : todayISO())
  const [note, setNote] = useState(purchase?.note || '')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const qtyNum = parseInt(qty, 10) || 0
  const costNum = Number(cost) || 0
  const total = qtyNum * costNum
  const paidNum = editing ? Number(purchase.paid_amount) : Number(paid) || 0
  const remaining = Math.max(total - paidNum, 0)

  const validate = () => {
    const fe = {}
    const se = validateSupplier(supplier)
    if (se) fe.supplier = se
    if (!qtyNum || qtyNum < 1) fe.qty = 'Qty must be at least 1.'
    if (Number.isNaN(Number(cost)) || cost === '' || costNum < 0) fe.cost = 'Enter the cost price per unit.'
    if (!editing) {
      if (Number.isNaN(Number(paid)) || paidNum < 0) fe.paid = 'Paid amount must be 0 or more.'
      else if (paidNum > total) fe.paid = 'Paid amount cannot be more than the total cost.'
    } else if (total < paidNum) {
      fe.cost = `Total (${fmtMoney(total)}) cannot be less than what was already paid (${fmtMoney(paidNum)}).`
    }
    setFieldErrors(fe)
    return Object.keys(fe).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setBusy(true)
    try {
      let saved
      if (editing) {
        const { data } = await api.put(`/purchases/${purchase.id}`, {
          supplier_id: Number(supplier.supplier_id),
          qty: qtyNum,
          cost_price: costNum,
          purchase_date: date,
          note: note || null,
          tz_offset: tzOffset(),
        })
        saved = data
      } else {
        const { data } = await api.post('/purchases', {
          stock_barcode: item.stock_barcode,
          ...supplierPayload(supplier),
          qty: qtyNum,
          cost_price: costNum,
          paid_amount: paidNum,
          purchase_date: date,
          note: note || null,
          tz_offset: tzOffset(),
        })
        saved = data
      }
      if (file) {
        const { data } = await uploadFile(`/purchases/${saved.id}/receipt`, file)
        saved = data
      }
      toast.success(editing ? 'Purchase updated.' : `${qtyNum} unit(s) added to the store.`)
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

      <div className="customer-preview span-2">
        <strong>{editing ? purchase.stock_name : item.stock_name}</strong>
        <span className="mono">{editing ? purchase.stock_barcode : item.stock_barcode}</span>
        {!editing && <span>{item.qty} in store now</span>}
      </div>

      {editing ? (
        <label className="field span-2">
          <span>Supplier *</span>
          <select value={supplier.supplier_id} onChange={(e) => setSupplier({ ...supplier, supplier_id: e.target.value })}>
            <option value="">— Select a supplier —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {fieldErrors.supplier && <span className="field-error">{fieldErrors.supplier}</span>}
        </label>
      ) : (
        <SupplierPicker suppliers={suppliers} value={supplier} onChange={setSupplier} error={fieldErrors.supplier} />
      )}

      <label className="field">
        <span>Qty bought *</span>
        <input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        {fieldErrors.qty && <span className="field-error">{fieldErrors.qty}</span>}
      </label>
      <label className="field">
        <span>Cost price per unit (Rs) *</span>
        <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
        {fieldErrors.cost && <span className="field-error">{fieldErrors.cost}</span>}
      </label>

      <DateField label="Purchase date" value={date} onChange={setDate} />
      <label className="field">
        <span>Note</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional — invoice no., remarks…" />
      </label>

      <div className="totals-grid span-2">
        <div className="total-box">
          <span>Total cost</span>
          <strong className="mono">{fmtMoney(total)}</strong>
          <small className="field-note">{qtyNum} × {fmtMoney(costNum)}</small>
        </div>
        {editing ? (
          <div className="total-box">
            <span>Paid so far</span>
            <strong className="mono">{fmtMoney(paidNum)}</strong>
            <small className="field-note">Use “Pay supplier” on the purchase to record more.</small>
          </div>
        ) : (
          <label className="field total-box">
            <span>Paid now (Rs)</span>
            <input type="number" min="0" step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} />
            <small className="field-note">What you handed over today — can be 0.</small>
            {fieldErrors.paid && <span className="field-error">{fieldErrors.paid}</span>}
          </label>
        )}
        <div className={`total-box ${remaining > 0 ? 'total-box--due' : 'total-box--clear'}`}>
          <span>Remaining to pay</span>
          <strong className="mono">{fmtMoney(remaining)}</strong>
        </div>
      </div>

      <div className="span-2">
        <FilePicker
          file={file}
          onChange={setFile}
          label={editing && purchase.receipt ? 'Replace receipt (optional)' : 'Purchase receipt / bill (optional)'}
          hint="A photo of the supplier's bill. Saved with the purchase."
        />
      </div>

      <div className="form-actions span-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add purchase to store'}
        </button>
      </div>
    </form>
  )
}
