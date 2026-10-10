import { useState } from 'react'
import api, { apiError, fmtDay, fmtMoney, todayISO, tzOffset } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import DateField from '../DateField'
import Modal from '../Modal'

/** Record a payment to the supplier against one purchase — the mirror of a customer deposit. */
export default function PurchasePaymentModal({ purchase, onClose, onSaved }) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const val = Number(amount)
    if (Number.isNaN(val) || val <= 0) return setError('Enter an amount greater than 0.')
    if (val > purchase.remaining_balance)
      return setError(`That is more than the remaining balance of ${fmtMoney(purchase.remaining_balance)}.`)
    setBusy(true)
    try {
      const { data } = await api.post(`/purchases/${purchase.id}/payments`, {
        amount: val,
        payment_date: date,
        note: note || null,
        tz_offset: tzOffset(),
      })
      toast.success(data.status === 'closed' ? 'Payment recorded — this purchase is fully paid.' : 'Payment recorded.')
      onSaved(data)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Pay supplier — ${purchase.supplier_name}`}
      subtitle={`${purchase.stock_name} · ${purchase.qty} unit(s) bought ${fmtDay(purchase.purchase_date)}`}
      onClose={onClose}
    >
      <div className="pay-summary">
        <div>
          <span>Total cost</span>
          <strong className="mono">{fmtMoney(purchase.total_cost)}</strong>
        </div>
        <div>
          <span>Paid</span>
          <strong className="mono">{fmtMoney(purchase.paid_amount)}</strong>
        </div>
        <div className={purchase.remaining_balance > 0 ? 'due' : 'clear'}>
          <span>Remaining</span>
          <strong className="mono">{fmtMoney(purchase.remaining_balance)}</strong>
        </div>
      </div>

      {purchase.remaining_balance <= 0 ? (
        <p className="field-note">This purchase is fully paid — nothing left to pay.</p>
      ) : (
        <form onSubmit={submit} className="form-grid">
          {error && <div className="form-error-banner span-2">{error}</div>}
          <label className="field">
            <span>Amount paid (Rs) *</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={purchase.remaining_balance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </label>
          <DateField label="Payment date" value={date} onChange={setDate} />
          <label className="field span-2">
            <span>Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional — e.g. cash, bank transfer" />
          </label>
          <div className="form-actions span-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</button>
          </div>
        </form>
      )}

      <h4 className="pay-history-title">Payment history</h4>
      {purchase.payments?.length ? (
        <ul className="pay-history">
          {purchase.payments.map((p) => (
            <li key={p.id}>
              <span className="mono">{fmtMoney(p.amount)}</span>
              <span className="td-muted">{fmtDay(p.payment_date)}</span>
              <span className="td-muted">{p.note || ''}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-note">Nothing paid yet.</p>
      )}
    </Modal>
  )
}
