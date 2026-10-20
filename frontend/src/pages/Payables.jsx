import { Banknote, FileText, Search, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api, { apiError, fmtDate, fmtDay, fmtMoney } from '../api/client'
import PaySupplierModal from '../components/payables/PaySupplierModal'
import { useToast } from '../context/ToastContext'

const SORTS = [
  { key: 'due', label: 'Highest remaining' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'recent', label: 'Latest purchase' },
]

export default function Payables() {
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const selected = params.get('id') || ''

  const [list, setList] = useState({ totals: null, suppliers: [] })
  const [loadingList, setLoadingList] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('due')
  const [onlyDue, setOnlyDue] = useState(true)

  const [detail, setDetail] = useState(null) // { id, payload }
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [paying, setPaying] = useState(false)

  // ------------------------------------------------------------ loading
  const loadList = useCallback(async () => {
    try {
      const { data } = await api.get('/payables')
      setList(data)
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setLoadingList(false)
    }
  }, []) // eslint-disable-line

  const loadDetail = useCallback(
    async (id) => {
      if (!id) return setDetail(null)
      setLoadingDetail(true)
      try {
        const { data } = await api.get(`/payables/${id}`)
        setDetail({ id, payload: data })
      } catch (err) {
        setDetail(null)
        toast.error(apiError(err))
      } finally {
        setLoadingDetail(false)
      }
    },
    [] // eslint-disable-line
  )

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    loadDetail(selected)
  }, [selected, loadDetail])

  const select = (id) => setParams(id ? { id: String(id) } : {})

  // ------------------------------------------------------------- picker
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let out = list.suppliers.filter(
      (s) =>
        !needle ||
        [s.name, s.phone, s.address].some((f) => String(f ?? '').toLowerCase().includes(needle))
    )
    if (onlyDue) out = out.filter((s) => s.outstanding > 0 || String(s.id) === selected)
    const by = {
      due: (a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      recent: (a, b) => (b.last_purchase || '').localeCompare(a.last_purchase || ''),
    }[sort]
    return [...out].sort(by)
  }, [list, query, sort, onlyDue, selected])

  const data = detail && detail.id === selected ? detail.payload : null
  const t = list.totals

  // ------------------------------------------------------------- actions
  const afterPay = (result) => {
    setPaying(false)
    setDetail({ id: selected, payload: result.detail })
    loadList()
    const closed = result.allocations.filter((a) => a.status === 'closed')
    const amount = fmtMoney(result.settlement.amount)
    toast.success(
      closed.length
        ? `${amount} paid — ${closed.length} purchase(s) ${closed.length === 1 ? 'is' : 'are'} now fully paid.`
        : `${amount} paid and applied to ${result.allocations[0]?.label}.`
    )
  }

  const undo = async (h) => {
    if (
      !window.confirm(
        `Undo the payment of ${fmtMoney(h.amount)} dated ${fmtDay(h.payment_date)}?\n\n` +
          `It will be removed from ${h.purchases.map((p) => p.label).join(', ')} and any purchase it closed will reopen.`
      )
    )
      return
    try {
      const { data } = await api.delete(`/payables/${selected}/settlements/${h.id}`)
      setDetail({ id: selected, payload: data })
      loadList()
      toast.success('Payment undone — the purchases carry their balances again.')
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Payables</h1>
          <p className="page-sub">
            What you have bought from each supplier, what you have paid them, and what is still
            owed. Pay against the account and the oldest purchases clear themselves.
          </p>
        </div>
      </header>

      {t && (
        <div className="stat-grid recv-totals">
          <div className="stat-card stat-card--blue">
            <div className="stat-label">Total purchased</div>
            <div className="stat-value">{fmtMoney(t.total_bought)}</div>
            <div className="stat-sub">{t.suppliers} supplier(s), all time</div>
          </div>
          <div className="stat-card stat-card--green">
            <div className="stat-label">Total paid</div>
            <div className="stat-value">{fmtMoney(t.total_paid)}</div>
            <div className="stat-sub">Payments on purchases and on account</div>
          </div>
          <div className={`stat-card ${t.outstanding > 0 ? 'stat-card--amber' : 'stat-card--green'}`}>
            <div className="stat-label">Total remaining</div>
            <div className="stat-value">{fmtMoney(t.outstanding)}</div>
            <div className="stat-sub">
              {t.with_dues > 0 ? `Owed to ${t.with_dues} supplier(s)` : 'Everything is cleared'}
            </div>
          </div>
        </div>
      )}

      <div className="ledger-layout">
        {/* ------------------------- suppliers ------------------------- */}
        <aside className="ledger-picker card">
          <div className="search-box search-box--block">
            <Search size={15} />
            <input
              placeholder="Search suppliers…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="recv-picker-tools">
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort suppliers">
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <label className="check-inline">
              <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} />
              With dues only
            </label>
          </div>
          <div className="picker-list">
            {loadingList ? (
              <p className="empty-note">Loading suppliers…</p>
            ) : rows.length === 0 ? (
              <p className="empty-note">
                {onlyDue ? 'You owe nothing to any supplier right now.' : 'No suppliers found.'}
              </p>
            ) : (
              rows.map((s) => (
                <button
                  key={s.id}
                  className={`picker-item ${selected === String(s.id) ? 'is-selected' : ''}`}
                  onClick={() => select(s.id)}
                >
                  <div className="picker-main">
                    <div className="picker-title">{s.name}</div>
                    <div className="picker-sub">
                      {s.phone || '—'}
                      {s.address ? ` · ${s.address}` : ''}
                    </div>
                    <div className="picker-meta">
                      Bought {fmtMoney(s.total_bought)} · Paid {fmtMoney(s.total_paid)}
                    </div>
                  </div>
                  <div className={`picker-value mono ${s.outstanding > 0 ? 'amount-due' : 'amount-clear'}`}>
                    {fmtMoney(s.outstanding)}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* --------------------------- account --------------------------- */}
        <section className="ledger-body">
          {!selected ? (
            <div className="card ledger-placeholder">
              <h2>Pick a supplier to see their account</h2>
              <p className="page-sub">
                You will see the total stock purchased from them, the total paid and the total
                remaining, with a single button to record a new payment.
              </p>
            </div>
          ) : loadingDetail && !data ? (
            <div className="card">
              <p className="empty-note">Loading account…</p>
            </div>
          ) : !data ? (
            <div className="card">
              <p className="empty-note">This account could not be loaded.</p>
            </div>
          ) : (
            <div className={loadingDetail ? 'is-refreshing' : ''}>
              <AccountView
                data={data}
                onPay={() => setPaying(true)}
                onUndo={undo}
                onOpenLedger={() => navigate(`/ledgers?tab=supplier&id=${selected}`)}
                onOpenItem={(barcode) =>
                  navigate(`/ledgers?tab=item&id=${encodeURIComponent(barcode)}`)
                }
              />
            </div>
          )}
        </section>
      </div>

      {paying && data && (
        <PaySupplierModal data={data} onClose={() => setPaying(false)} onSaved={afterPay} />
      )}
    </div>
  )
}

function AccountView({ data, onPay, onUndo, onOpenLedger, onOpenItem }) {
  const { supplier: sup, summary: s, unpaid_purchases: unpaid, history } = data
  const due = s.outstanding > 0

  return (
    <>
      <div className="ledger-head">
        <div>
          <h2 className="ledger-title">{sup.name}</h2>
          <p className="ledger-sub">
            {sup.phone || 'No phone'}
            {sup.address && ` · ${sup.address}`}
          </p>
          <p className="ledger-sub">
            {s.purchases} purchase(s) · {s.units} unit(s) · Last purchase {fmtDay(s.last_purchase)} ·
            Last payment {fmtDay(s.last_payment)}
          </p>
        </div>
        <div className="recv-head-actions">
          <button className="btn btn-ghost" onClick={onOpenLedger}>
            <FileText size={16} /> Full ledger
          </button>
          <button className="btn btn-primary" onClick={onPay} disabled={!due}>
            <Banknote size={16} /> Pay supplier
          </button>
        </div>
      </div>

      <div className="stat-grid ledger-stats">
        <div className="stat-card stat-card--blue">
          <div className="stat-label">Total purchased</div>
          <div className="stat-value">{fmtMoney(s.total_bought)}</div>
          <div className="stat-sub">{s.purchases} purchase(s) all time</div>
        </div>
        <div className="stat-card stat-card--green">
          <div className="stat-label">Total paid</div>
          <div className="stat-value">{fmtMoney(s.total_paid)}</div>
          <div className="stat-sub">{s.closed_purchases} purchase(s) fully paid</div>
        </div>
        <div className={`stat-card ${due ? 'stat-card--amber' : 'stat-card--green'}`}>
          <div className="stat-label">Total remaining</div>
          <div className="stat-value">{fmtMoney(s.outstanding)}</div>
          <div className="stat-sub">
            {due ? `Across ${s.unpaid_purchases} unpaid purchase(s)` : 'Account fully cleared'}
          </div>
        </div>
      </div>

      {/* ---------------- unpaid purchases ---------------- */}
      <div className="card">
        <div className="card-title-row">
          <h2>Unpaid purchases</h2>
          <span className="ledger-count">{unpaid.length} purchase(s)</span>
        </div>
        <p className="ledger-note">
          Listed oldest first — that is the order a new payment is applied in. A purchase is
          marked paid on its own the moment its remaining balance reaches zero.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Item</th>
                <th className="th-num">Qty</th>
                <th className="th-num">Cost / Unit</th>
                <th className="th-num">Total cost</th>
                <th className="th-num">Paid</th>
                <th className="th-num">Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {unpaid.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-cell">
                    Nothing outstanding — every purchase from this supplier is paid.
                  </td>
                </tr>
              ) : (
                unpaid.map((p, i) => (
                  <tr key={p.id}>
                    <td className="td-muted mono">{i + 1}</td>
                    <td className="td-muted">{fmtDay(p.purchase_date)}</td>
                    <td>
                      <button className="link-btn" title="Open item ledger" onClick={() => onOpenItem(p.stock_barcode)}>
                        {p.stock_name}
                      </button>
                      <div className="td-muted mono">{p.stock_barcode}</div>
                    </td>
                    <td className="td-num mono">{p.qty}</td>
                    <td className="td-num mono">{fmtMoney(p.cost_price)}</td>
                    <td className="td-num mono">{fmtMoney(p.total_cost)}</td>
                    <td className="td-num mono amount-clear">{fmtMoney(p.paid_amount)}</td>
                    <td className="td-num mono amount-due td-strong">{fmtMoney(p.remaining_balance)}</td>
                    <td>
                      <span className={`status-chip status-chip--${p.status}`}>
                        {p.status === 'open' ? 'Owed' : 'Paid'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
              {unpaid.length > 0 && (
                <tr className="ledger-total">
                  <td colSpan={5}>Total remaining</td>
                  <td className="td-num mono">{fmtMoney(unpaid.reduce((a, p) => a + p.total_cost, 0))}</td>
                  <td className="td-num mono">{fmtMoney(unpaid.reduce((a, p) => a + p.paid_amount, 0))}</td>
                  <td className="td-num mono amount-due">{fmtMoney(s.outstanding)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- payments ---------------- */}
      <div className="card">
        <div className="card-title-row">
          <h2>Money paid</h2>
          <span className="ledger-count">{history.length} entry(ies)</span>
        </div>
        <p className="ledger-note">
          Every amount you have paid this supplier, newest first. Account payments show which
          purchases they were applied to; payments recorded on a purchase directly are listed too.
        </p>
        <div className="table-wrap">
          <table className="recv-history">
            <thead>
              <tr>
                <th>Date</th>
                <th>Kind</th>
                <th className="th-num">Amount</th>
                <th>Applied to</th>
                <th>Note</th>
                <th>By</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    No payments made to this supplier yet.
                  </td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={`${h.kind}-${h.id}`}>
                    <td className="td-muted">{fmtDate(h.payment_date)}</td>
                    <td>
                      <span className={`entry-tag ${h.kind === 'settlement' ? 'entry-tag--payment' : 'entry-tag--bill'}`}>
                        {h.kind === 'settlement' ? 'ON ACCOUNT' : 'ON PURCHASE'}
                      </span>
                    </td>
                    <td className="td-num mono amount-clear td-strong">{fmtMoney(h.amount)}</td>
                    <td>
                      <div className="recv-alloc">
                        {h.purchases.map((p) => (
                          <span key={p.purchase_id}>
                            {p.label}
                            {h.purchases.length > 1 && <span className="td-muted mono"> {fmtMoney(p.amount)}</span>}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="td-muted">{h.note || '—'}</td>
                    <td className="td-muted">{h.created_by || '—'}</td>
                    <td className="td-actions">
                      {h.kind === 'settlement' && (
                        <button className="icon-btn icon-btn--danger" title="Undo this payment" onClick={() => onUndo(h)}>
                          <Undo2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
