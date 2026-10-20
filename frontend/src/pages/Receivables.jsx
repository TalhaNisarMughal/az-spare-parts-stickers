import { FileText, HandCoins, Search, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api, { apiError, fmtDate, fmtDay, fmtMoney } from '../api/client'
import PdfModal from '../components/bills/PdfModal'
import ReceivePaymentModal from '../components/receivables/ReceivePaymentModal'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const SORTS = [
  { key: 'due', label: 'Highest remaining' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'recent', label: 'Latest purchase' },
]

export default function Receivables() {
  const toast = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()
  const admin = user?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const selected = params.get('id') || ''

  const [list, setList] = useState({ totals: null, customers: [] })
  const [loadingList, setLoadingList] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('due')
  const [onlyDue, setOnlyDue] = useState(true)

  const [detail, setDetail] = useState(null) // { code, payload }
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [receiving, setReceiving] = useState(false)
  const [billPdf, setBillPdf] = useState(null)

  // ------------------------------------------------------------ loading
  const loadList = useCallback(async () => {
    try {
      const { data } = await api.get('/receivables')
      setList(data)
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setLoadingList(false)
    }
  }, []) // eslint-disable-line

  const loadDetail = useCallback(
    async (code) => {
      if (!code) return setDetail(null)
      setLoadingDetail(true)
      try {
        const { data } = await api.get(`/receivables/${encodeURIComponent(code)}`)
        setDetail({ code, payload: data })
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

  const select = (code) => setParams(code ? { id: code } : {})

  // ------------------------------------------------------------- picker
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let out = list.customers.filter(
      (c) =>
        !needle ||
        [c.customer_name, c.customer_code, c.phone_number, c.shop_name].some((f) =>
          String(f ?? '').toLowerCase().includes(needle)
        )
    )
    if (onlyDue) out = out.filter((c) => c.outstanding > 0 || c.customer_code === selected)
    const by = {
      due: (a, b) => b.outstanding - a.outstanding || a.customer_name.localeCompare(b.customer_name),
      name: (a, b) => a.customer_name.localeCompare(b.customer_name),
      recent: (a, b) => (b.last_purchase || '').localeCompare(a.last_purchase || ''),
    }[sort]
    return [...out].sort(by)
  }, [list, query, sort, onlyDue, selected])

  const data = detail && detail.code === selected ? detail.payload : null
  const t = list.totals

  // ------------------------------------------------------------- actions
  const afterReceive = (result) => {
    setReceiving(false)
    setDetail({ code: selected, payload: result.detail })
    loadList()
    const closed = result.closed_bills
    const amount = fmtMoney(result.settlement.amount)
    toast.success(
      closed.length
        ? `${amount} received — ${closed.join(', ')} ${closed.length === 1 ? 'is' : 'are'} now fully paid and closed.`
        : `${amount} received and applied to ${result.allocations[0]?.bill_id}.`
    )
  }

  const undo = async (h) => {
    if (
      !window.confirm(
        `Undo the receiving of ${fmtMoney(h.amount)} dated ${fmtDay(h.payment_date)}?\n\n` +
          `It will be removed from ${h.bills.map((b) => b.bill_id).join(', ')} and any bill it closed will reopen.`
      )
    )
      return
    try {
      const { data } = await api.delete(
        `/receivables/${encodeURIComponent(selected)}/settlements/${h.id}`
      )
      setDetail({ code: selected, payload: data })
      loadList()
      toast.success('Receiving undone — the bills carry their balances again.')
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Receivables</h1>
          <p className="page-sub">
            What each customer has bought, what they have paid, and what is still owed. Receive
            money against the account and the oldest bills clear themselves.
          </p>
        </div>
      </header>

      {t && (
        <div className="stat-grid recv-totals">
          <div className="stat-card stat-card--blue">
            <div className="stat-label">Total sold</div>
            <div className="stat-value">{fmtMoney(t.total_billed)}</div>
            <div className="stat-sub">{t.customers} customer(s), all time</div>
          </div>
          <div className="stat-card stat-card--green">
            <div className="stat-label">Total received</div>
            <div className="stat-value">{fmtMoney(t.total_paid)}</div>
            <div className="stat-sub">Deposits and account receivings</div>
          </div>
          <div className={`stat-card ${t.outstanding > 0 ? 'stat-card--amber' : 'stat-card--green'}`}>
            <div className="stat-label">Total remaining</div>
            <div className="stat-value">{fmtMoney(t.outstanding)}</div>
            <div className="stat-sub">
              {t.with_dues > 0 ? `Owed by ${t.with_dues} customer(s)` : 'Everything is cleared'}
            </div>
          </div>
        </div>
      )}

      <div className="ledger-layout">
        {/* ------------------------- customers ------------------------- */}
        <aside className="ledger-picker card">
          <div className="search-box search-box--block">
            <Search size={15} />
            <input
              placeholder="Search customers…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="recv-picker-tools">
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort customers">
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
              <p className="empty-note">Loading customers…</p>
            ) : rows.length === 0 ? (
              <p className="empty-note">
                {onlyDue ? 'No customer owes anything right now.' : 'No customers found.'}
              </p>
            ) : (
              rows.map((c) => (
                <button
                  key={c.customer_code}
                  className={`picker-item ${selected === c.customer_code ? 'is-selected' : ''}`}
                  onClick={() => select(c.customer_code)}
                >
                  <div className="picker-main">
                    <div className="picker-title">{c.customer_name}</div>
                    <div className="picker-sub mono">
                      {c.customer_code}
                      {c.shop_name ? ` · ${c.shop_name}` : ''}
                    </div>
                    <div className="picker-meta">
                      Sold {fmtMoney(c.total_billed)} · Received {fmtMoney(c.total_paid)}
                    </div>
                  </div>
                  <div className={`picker-value mono ${c.outstanding > 0 ? 'amount-due' : 'amount-clear'}`}>
                    {fmtMoney(c.outstanding)}
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
              <h2>Pick a customer to see their account</h2>
              <p className="page-sub">
                You will see their total sales, total received and total remaining, with a single
                button to record a new amount received.
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
                admin={admin}
                onReceive={() => setReceiving(true)}
                onUndo={undo}
                onOpenBill={setBillPdf}
                onOpenLedger={() =>
                  navigate(`/ledgers?tab=customer&id=${encodeURIComponent(selected)}`)
                }
              />
            </div>
          )}
        </section>
      </div>

      {receiving && data && (
        <ReceivePaymentModal
          data={data}
          onClose={() => setReceiving(false)}
          onSaved={afterReceive}
        />
      )}
      {billPdf && <PdfModal billId={billPdf} onClose={() => setBillPdf(null)} />}
    </div>
  )
}

function AccountView({ data, admin, onReceive, onUndo, onOpenBill, onOpenLedger }) {
  const { customer: c, summary: s, unpaid_bills: unpaid, history } = data
  const due = s.outstanding > 0

  return (
    <>
      <div className="ledger-head">
        <div>
          <h2 className="ledger-title">{c.customer_name}</h2>
          <p className="ledger-sub">
            <span className="mono">{c.customer_code}</span> · {c.phone_number}
            {c.shop_name && ` · ${c.shop_name}`}
          </p>
          <p className="ledger-sub">
            {s.bills} bill(s) · Last purchase {fmtDay(s.last_purchase)} · Last payment{' '}
            {fmtDay(s.last_payment)}
          </p>
        </div>
        <div className="recv-head-actions">
          <button className="btn btn-ghost" onClick={onOpenLedger}>
            <FileText size={16} /> Full ledger
          </button>
          <button className="btn btn-primary" onClick={onReceive} disabled={!due}>
            <HandCoins size={16} /> Receive payment
          </button>
        </div>
      </div>

      <div className="stat-grid ledger-stats">
        <div className="stat-card stat-card--blue">
          <div className="stat-label">Total sale</div>
          <div className="stat-value">{fmtMoney(s.total_billed)}</div>
          <div className="stat-sub">{s.bills} bill(s) all time</div>
        </div>
        <div className="stat-card stat-card--green">
          <div className="stat-label">Total received</div>
          <div className="stat-value">{fmtMoney(s.total_paid)}</div>
          <div className="stat-sub">{s.closed_bills} bill(s) fully paid</div>
        </div>
        <div className={`stat-card ${due ? 'stat-card--amber' : 'stat-card--green'}`}>
          <div className="stat-label">Total remaining</div>
          <div className="stat-value">{fmtMoney(s.outstanding)}</div>
          <div className="stat-sub">
            {due ? `Across ${s.unpaid_bills} unpaid bill(s)` : 'Account fully cleared'}
          </div>
        </div>
      </div>

      {/* ---------------- unpaid bills ---------------- */}
      <div className="card">
        <div className="card-title-row">
          <h2>Unpaid bills</h2>
          <span className="ledger-count">{unpaid.length} bill(s)</span>
        </div>
        <p className="ledger-note">
          Listed oldest first — that is the order a new receiving is applied in. A bill closes on
          its own the moment its remaining balance reaches zero.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Bill ID</th>
                <th>Date</th>
                <th>Salesman</th>
                <th>Type</th>
                <th className="th-num">Net total</th>
                <th className="th-num">Paid</th>
                <th className="th-num">Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {unpaid.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-cell">
                    Nothing outstanding — every bill for this customer is paid.
                  </td>
                </tr>
              ) : (
                unpaid.map((b, i) => (
                  <tr key={b.bill_id}>
                    <td className="td-muted mono">{i + 1}</td>
                    <td>
                      <button className="link-btn mono" onClick={() => onOpenBill(b.bill_id)}>
                        {b.bill_id}
                      </button>
                    </td>
                    <td className="td-muted">{fmtDay(b.purchase_date)}</td>
                    <td>{b.salesman_name}</td>
                    <td className="td-muted">{b.payment_type}</td>
                    <td className="td-num mono">{fmtMoney(b.net_total)}</td>
                    <td className="td-num mono amount-clear">{fmtMoney(b.deposited_amount)}</td>
                    <td className="td-num mono amount-due td-strong">{fmtMoney(b.remaining_balance)}</td>
                    <td>
                      <span className={`status-chip status-chip--${b.status}`}>
                        {b.status === 'open' ? 'Open' : 'Closed'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
              {unpaid.length > 0 && (
                <tr className="ledger-total">
                  <td colSpan={5}>Total remaining</td>
                  <td className="td-num mono">{fmtMoney(unpaid.reduce((a, b) => a + b.net_total, 0))}</td>
                  <td className="td-num mono">{fmtMoney(unpaid.reduce((a, b) => a + b.deposited_amount, 0))}</td>
                  <td className="td-num mono amount-due">{fmtMoney(s.outstanding)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- receivings ---------------- */}
      <div className="card">
        <div className="card-title-row">
          <h2>Money received</h2>
          <span className="ledger-count">{history.length} entry(ies)</span>
        </div>
        <p className="ledger-note">
          Every amount this customer has paid, newest first. Account receivings show which bills
          they were applied to; deposits recorded on a bill directly are listed too.
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
                {admin && <th className="th-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={admin ? 7 : 6} className="empty-cell">
                    No payments received from this customer yet.
                  </td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={`${h.kind}-${h.id}`}>
                    <td className="td-muted">{fmtDate(h.payment_date)}</td>
                    <td>
                      <span className={`entry-tag ${h.kind === 'settlement' ? 'entry-tag--payment' : 'entry-tag--bill'}`}>
                        {h.kind === 'settlement' ? 'ON ACCOUNT' : 'ON BILL'}
                      </span>
                    </td>
                    <td className="td-num mono amount-clear td-strong">{fmtMoney(h.amount)}</td>
                    <td>
                      <div className="recv-alloc">
                        {h.bills.map((b) => (
                          <button key={b.bill_id} className="link-btn mono" onClick={() => onOpenBill(b.bill_id)}>
                            {b.bill_id}
                            {h.bills.length > 1 && <span className="td-muted"> {fmtMoney(b.amount)}</span>}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="td-muted">
                      {h.kind === 'settlement' ? h.note || '—' : h.note || '—'}
                    </td>
                    <td className="td-muted">{h.created_by || '—'}</td>
                    {admin && (
                      <td className="td-actions">
                        {h.kind === 'settlement' && (
                          <button className="icon-btn icon-btn--danger" title="Undo this receiving" onClick={() => onUndo(h)}>
                            <Undo2 size={15} />
                          </button>
                        )}
                      </td>
                    )}
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
