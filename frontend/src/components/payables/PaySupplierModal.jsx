import { useMemo, useState } from 'react'
import api, { apiError, fmtDay, fmtMoney, todayISO, tzOffset } from '../../api/client'
import DateField from '../DateField'
import Modal from '../Modal'

/** Preview how an amount will spread over the unpaid purchases, oldest first. */
function allocate(amount, purchases) {
  let left = Math.round(amount * 100)
  const rows = []
  for (const p of purchases) {
    if (left <= 0) break
    const due = Math.round(p.remaining_balance * 100)
    const slice = Math.min(left, due)
    rows.push({
      id: p.id,
      purchase_date: p.purchase_date,
      stock_name: p.stock_name,
      qty: p.qty,
      remaining: p.remaining_balance,
      applied: slice / 100,
      after: (due - slice) / 100,
    })
    left -= slice
  }
  return rows
}

export default function PaySupplierModal({ data, onClose, onSaved }) {
  const { supplier: sup, summary: s, unpaid_purchases: unpaid } = data
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const val = Number(amount)
  const valid = !Number.isNaN(val) && val > 0 && val <= s.outstanding
  const preview = useMemo(() => (valid ? allocate(val, unpaid) : []), [val, valid, unpaid])
  const closes = preview.filter((p) => p.after === 0).length

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (Number.isNaN(val) || val <= 0) return setError('Enter an amount greater than 0.')
    if (val > s.outstanding)
      return setError(`That is more than the ${fmtMoney(s.outstanding)} you owe this supplier.`)
    setBusy(true)
    try {
      const { data: result } = await api.post(`/payables/${sup.id}/settlements`, {
        amount: val,
        note: note || null,
        payment_date: date,
        tz_offset: tzOffset(),
      })
      onSaved(result)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Pay supplier — ${sup.name}`}
      subtitle={`${s.unpaid_purchases} unpaid purchase(s)`}
      onClose={onClose}
      wide
    >
      <div className="pay-summary">
        <div>
          <span>Total purchased</span>
          <strong className="mono">{fmtMoney(s.total_bought)}</strong>
        </div>
        <div>
          <span>Paid so far</span>
          <strong className="mono">{fmtMoney(s.total_paid)}</strong>
        </div>
        <div className="due">
          <span>Remaining</span>
          <strong className="mono">{fmtMoney(s.outstanding)}</strong>
        </div>
      </div>

      <form onSubmit={submit} className="form-grid">
        {error && <div className="form-error-banner span-2">{error}</div>}
        <label className="field">
          <span>Amount paid (Rs) *</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            max={s.outstanding}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
          <small className="field-note">
            <button type="button" className="link-btn" onClick={() => setAmount(String(s.outstanding))}>
              Clear the whole balance ({fmtMoney(s.outstanding)})
            </button>
          </small>
        </label>
        <DateField label="Date paid" value={date} onChange={setDate} />
        <label className="field span-2">
          <span>Note</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional — e.g. cash, bank transfer ref. 1234"
          />
        </label>

        <div className="span-2">
          <h4 className="pay-history-title">How it will be applied</h4>
          {!valid ? (
            <p className="field-note">
              Enter an amount to see which purchases it clears. Oldest purchases are settled first.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Item</th>
                    <th className="th-num">Qty</th>
                    <th className="th-num">Remaining</th>
                    <th className="th-num">Applied</th>
                    <th className="th-num">Left after</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p) => (
                    <tr key={p.id}>
                      <td className="td-muted">{fmtDay(p.purchase_date)}</td>
                      <td>{p.stock_name}</td>
                      <td className="td-num mono">{p.qty}</td>
                      <td className="td-num mono">{fmtMoney(p.remaining)}</td>
                      <td className="td-num mono amount-clear">{fmtMoney(p.applied)}</td>
                      <td className={`td-num mono ${p.after > 0 ? 'amount-due' : ''}`}>{fmtMoney(p.after)}</td>
                      <td>
                        <span className={`status-chip status-chip--${p.after === 0 ? 'closed' : 'open'}`}>
                          {p.after === 0 ? 'Will close' : 'Part paid'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {valid && (
            <p className="field-note">
              {closes > 0
                ? `${closes} purchase(s) will be fully paid. `
                : 'No purchase is fully cleared by this amount. '}
              Remaining after this payment: <b>{fmtMoney(Math.round((s.outstanding - val) * 100) / 100)}</b>.
            </p>
          )}
        </div>

        <div className="form-actions span-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !valid}>
            {busy ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
