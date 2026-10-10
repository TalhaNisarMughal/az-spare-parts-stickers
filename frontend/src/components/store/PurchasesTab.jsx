import { Banknote, BookOpen, Paperclip, Pencil, Search, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { apiError, fmtDay, fmtMoney, tzOffset } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import Modal from '../Modal'
import ReceiptModal from '../ReceiptModal'
import PurchaseForm from './PurchaseForm'
import PurchasePaymentModal from './PurchasePaymentModal'

/** Every lot of stock ever bought: who from, how much it cost, what is still owed. */
export default function PurchasesTab({ suppliers, onChanged }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [edit, setEdit] = useState(null)
  const [pay, setPay] = useState(null)
  const [receipt, setReceipt] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/purchases', {
        params: {
          q: q || undefined,
          supplier_id: supplierId || undefined,
          status: status || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          tz_offset: tzOffset(),
        },
      })
      setRows(data)
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [q, supplierId, status, dateFrom, dateTo]) // eslint-disable-line

  const refresh = () => {
    load()
    onChanged?.()
  }

  const remove = async (p) => {
    if (!window.confirm(`Delete this purchase of ${p.qty} × ${p.stock_name}? The units will be removed from the store.`)) return
    try {
      await api.delete(`/purchases/${p.id}`)
      toast.success('Purchase deleted and stock adjusted.')
      refresh()
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  const filtersActive = q || supplierId || status || dateFrom || dateTo
  const totals = rows.reduce(
    (a, p) => ({ cost: a.cost + p.total_cost, paid: a.paid + p.paid_amount, due: a.due + p.remaining_balance, units: a.units + p.qty }),
    { cost: 0, paid: 0, due: 0, units: 0 }
  )

  return (
    <div className="card">
      <div className="card-toolbar card-toolbar--filters">
        <div className="search-box">
          <Search size={15} />
          <input placeholder="Search by supplier, item, barcode or note…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="filter-field">
          <span>Supplier</span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>From</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="filter-field">
          <span>To</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <label className="filter-field">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="open">Balance owed</option>
            <option value="closed">Fully paid</option>
          </select>
        </label>
        {filtersActive && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setSupplierId(''); setStatus(''); setDateFrom(''); setDateTo('') }}>
            <X size={14} /> Clear
          </button>
        )}
      </div>

      <div className="legend-row">
        <span className="legend legend--open">Balance still owed to the supplier</span>
        <span className="legend legend--closed">Fully paid</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Supplier</th>
              <th>Item</th>
              <th className="th-num">Qty</th>
              <th className="th-num">Cost / Unit</th>
              <th className="th-num">Total Cost</th>
              <th className="th-num">Paid</th>
              <th className="th-num">Remaining</th>
              <th>Status</th>
              <th>Note</th>
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="empty-cell">Loading purchases…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="empty-cell">
                  {filtersActive ? 'No purchases match these filters.' : 'No purchases recorded yet. Use “Add Stock” or “Restock” on an item.'}
                </td>
              </tr>
            ) : (
              <>
                {rows.map((p) => (
                  <tr key={p.id} className={`ledger-row ledger-row--${p.status}`}>
                    <td className="td-muted">{fmtDay(p.purchase_date)}</td>
                    <td>
                      <button className="link-btn td-strong" title="Open supplier ledger" onClick={() => navigate(`/ledgers?tab=supplier&id=${p.supplier_id}`)}>
                        {p.supplier_name}
                      </button>
                    </td>
                    <td>
                      <button className="link-btn" title="Open item ledger" onClick={() => navigate(`/ledgers?tab=item&id=${encodeURIComponent(p.stock_barcode)}`)}>
                        {p.stock_name}
                      </button>
                      <div className="td-muted mono">{p.stock_barcode}</div>
                    </td>
                    <td className="td-num mono">{p.qty}</td>
                    <td className="td-num mono">{fmtMoney(p.cost_price)}</td>
                    <td className="td-num mono td-strong">{fmtMoney(p.total_cost)}</td>
                    <td className="td-num mono">{fmtMoney(p.paid_amount)}</td>
                    <td className={`td-num mono ${p.remaining_balance > 0 ? 'amount-due' : 'amount-clear'}`}>{fmtMoney(p.remaining_balance)}</td>
                    <td><span className={`status-chip status-chip--${p.status}`}>{p.status === 'open' ? 'Owed' : 'Paid'}</span></td>
                    <td className="td-muted">{p.note || '—'}</td>
                    <td className="td-actions">
                      <button className="icon-btn" title="Open supplier ledger" onClick={() => navigate(`/ledgers?tab=supplier&id=${p.supplier_id}`)}>
                        <BookOpen size={15} />
                      </button>
                      <button className={`icon-btn ${p.receipt ? 'icon-btn--has' : ''}`} title={p.receipt ? 'View receipt' : 'Attach receipt'} onClick={() => setReceipt(p)}>
                        <Paperclip size={15} />
                      </button>
                      <button className="icon-btn" title="Pay supplier" onClick={() => setPay(p)} disabled={p.remaining_balance <= 0}>
                        <Banknote size={15} />
                      </button>
                      <button className="icon-btn" title="Edit purchase" onClick={() => setEdit(p)}>
                        <Pencil size={15} />
                      </button>
                      <button className="icon-btn icon-btn--danger" title="Delete purchase" onClick={() => remove(p)}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="ledger-total">
                  <td colSpan={3}>Total ({rows.length} purchase{rows.length === 1 ? '' : 's'})</td>
                  <td className="td-num mono">{totals.units}</td>
                  <td />
                  <td className="td-num mono">{fmtMoney(totals.cost)}</td>
                  <td className="td-num mono">{fmtMoney(totals.paid)}</td>
                  <td className={`td-num mono ${totals.due > 0 ? 'amount-due' : 'amount-clear'}`}>{fmtMoney(totals.due)}</td>
                  <td colSpan={3} />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal title="Edit purchase" subtitle="Changing the quantity adjusts the store; the item's average cost is recalculated." onClose={() => setEdit(null)}>
          <PurchaseForm purchase={edit} suppliers={suppliers} onCancel={() => setEdit(null)} onSaved={() => { setEdit(null); refresh() }} />
        </Modal>
      )}
      {pay && <PurchasePaymentModal purchase={pay} onClose={() => setPay(null)} onSaved={() => { setPay(null); refresh() }} />}
      {receipt && (
        <ReceiptModal
          title={`Purchase receipt — ${receipt.stock_name}`}
          subtitle={`${receipt.supplier_name} · ${fmtDay(receipt.purchase_date)} · ${fmtMoney(receipt.total_cost)}`}
          receipt={receipt.receipt}
          endpoint={`/purchases/${receipt.id}/receipt`}
          onChanged={(updated) => { setReceipt(updated); setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r))) }}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  )
}
