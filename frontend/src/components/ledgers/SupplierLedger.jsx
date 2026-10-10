import { Paperclip, Printer } from 'lucide-react'
import { fmtDay, fmtMoney } from '../../api/client'

/** The customer ledger turned around: what the shop owes a supplier, and what it has paid. */
export default function SupplierLedger({ data, onPrint, onOpenItem, onOpenReceipt }) {
  const { supplier: sup, summary: s, entries, purchases, top_items: topItems } = data
  const due = s.outstanding > 0

  return (
    <>
      <div className="ledger-head">
        <div>
          <h2 className="ledger-title">{sup.name}</h2>
          <p className="ledger-sub">
            {sup.phone && <span className="mono">{sup.phone}</span>}
            {sup.phone && sup.address && ' · '}
            {sup.address}
            {sup.notes && ` · ${sup.notes}`}
          </p>
          <p className="ledger-sub">
            Supplier since {fmtDay(sup.created_at)} · First purchase {fmtDay(s.first_purchase)} · Last purchase{' '}
            {fmtDay(s.last_purchase)}
          </p>
        </div>
        <button className="btn btn-primary" onClick={onPrint}>
          <Printer size={16} /> Preview / Print PDF
        </button>
      </div>

      <div className="stat-grid ledger-stats">
        <div className="stat-card">
          <div className="stat-label">Opening balance</div>
          <div className="stat-value">{fmtMoney(data.opening_balance)}</div>
          <div className="stat-sub">Owed before this period</div>
        </div>
        <div className="stat-card stat-card--blue">
          <div className="stat-label">Bought in period</div>
          <div className="stat-value">{fmtMoney(s.period_bought)}</div>
          <div className="stat-sub">{s.period_purchases} purchase(s) · {s.period_units} unit(s)</div>
        </div>
        <div className="stat-card stat-card--green">
          <div className="stat-label">Paid in period</div>
          <div className="stat-value">{fmtMoney(s.period_paid)}</div>
          <div className="stat-sub">Handed to the supplier</div>
        </div>
        <div className={`stat-card ${due ? 'stat-card--amber' : 'stat-card--green'}`}>
          <div className="stat-label">You owe them</div>
          <div className="stat-value">{fmtMoney(s.outstanding)}</div>
          <div className="stat-sub">{due ? 'Still to pay' : 'Fully settled'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">All-time bought</div>
          <div className="stat-value">{fmtMoney(s.all_time_bought)}</div>
          <div className="stat-sub">{s.all_time_purchases} purchase(s) · {s.open_purchases} owed · {s.closed_purchases} paid</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title-row">
          <h2>Running account</h2>
        </div>
        <p className="ledger-note">
          Purchases are debits (what you owe), payments are credits. The <b>Balance</b> column is the true amount owed
          to this supplier at that moment across the whole history — filters only hide rows, they never distort it.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Particulars</th>
                <th>Purchase</th>
                <th className="th-num">Qty</th>
                <th className="th-num">Debit (owed)</th>
                <th className="th-num">Credit (paid)</th>
                <th className="th-num">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="ledger-opening">
                <td className="td-muted">—</td>
                <td className="td-strong">Opening balance</td>
                <td colSpan={4} />
                <td className="td-num mono td-strong">{fmtMoney(data.opening_balance)}</td>
              </tr>
              {entries.length === 0 ? (
                <tr><td colSpan={7} className="empty-cell">No activity for these filters.</td></tr>
              ) : (
                entries.map((e, i) => (
                  <tr key={i} className={`ledger-row ledger-row--${e.kind === 'purchase' ? 'bill' : 'payment'}`}>
                    <td className="td-muted">{fmtDay(e.date)}</td>
                    <td>
                      <span className={`entry-tag entry-tag--${e.kind === 'purchase' ? 'bill' : 'payment'}`}>
                        {e.kind === 'purchase' ? 'PURCHASE' : 'PAYMENT'}
                      </span>{' '}
                      {e.kind === 'purchase' ? (
                        <button className="link-btn" onClick={() => onOpenItem(e.stock_barcode)}>{e.particulars}</button>
                      ) : (
                        e.particulars
                      )}
                    </td>
                    <td className="mono td-muted">#{e.purchase_id}</td>
                    <td className="td-num mono">{e.units || '—'}</td>
                    <td className="td-num mono">{e.debit ? fmtMoney(e.debit) : '—'}</td>
                    <td className="td-num mono amount-clear">{e.credit ? fmtMoney(e.credit) : '—'}</td>
                    <td className="td-num mono td-strong">{fmtMoney(e.balance)}</td>
                  </tr>
                ))
              )}
              <tr className="ledger-total">
                <td colSpan={3}>Total for period</td>
                <td className="td-num mono">{s.period_units}</td>
                <td className="td-num mono">{fmtMoney(s.period_bought)}</td>
                <td className="td-num mono">{fmtMoney(s.period_paid)}</td>
                <td className={`td-num mono ${due ? 'amount-due' : 'amount-clear'}`}>{fmtMoney(s.outstanding)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title-row">
          <h2>Purchase detail</h2>
          <span className="ledger-count">{purchases.length} purchase(s)</span>
        </div>
        {purchases.length === 0 ? (
          <p className="empty-note">No purchases for these filters.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>No.</th>
                  <th>Item</th>
                  <th className="th-num">Qty</th>
                  <th className="th-num">Cost / Unit</th>
                  <th className="th-num">Total</th>
                  <th className="th-num">Paid</th>
                  <th className="th-num">Remaining</th>
                  <th>Status</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className={`ledger-row ledger-row--${p.status}`}>
                    <td className="td-muted">{fmtDay(p.purchase_date)}</td>
                    <td className="mono td-muted">#{p.id}</td>
                    <td>
                      <button className="link-btn" onClick={() => onOpenItem(p.stock_barcode)}>{p.item_name}</button>
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
                      {p.receipt_id && (
                        <button className="icon-btn icon-btn--has" title="View receipt" onClick={() => onOpenReceipt(p)}>
                          <Paperclip size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {topItems.length > 0 && (
        <div className="card">
          <div className="card-title-row">
            <h2>What you buy from them</h2>
            <span className="ledger-count">{topItems.length} item(s) in this period</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Barcode</th>
                  <th className="th-num">Total Qty</th>
                  <th className="th-num">Lots</th>
                  <th className="th-num">Avg Cost / Unit</th>
                  <th className="th-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((t) => (
                  <tr key={t.stock_barcode}>
                    <td><button className="link-btn td-strong" onClick={() => onOpenItem(t.stock_barcode)}>{t.item_name}</button></td>
                    <td className="mono td-muted">{t.stock_barcode}</td>
                    <td className="td-num mono">{t.qty}</td>
                    <td className="td-num mono">{t.lots}</td>
                    <td className="td-num mono">{fmtMoney(t.avg_cost)}</td>
                    <td className="td-num mono td-strong">{fmtMoney(t.amount)}</td>
                  </tr>
                ))}
                <tr className="ledger-total">
                  <td colSpan={2}>Total</td>
                  <td className="td-num mono">{topItems.reduce((a, t) => a + t.qty, 0)}</td>
                  <td className="td-num mono">{topItems.reduce((a, t) => a + t.lots, 0)}</td>
                  <td />
                  <td className="td-num mono">{fmtMoney(topItems.reduce((a, t) => a + t.amount, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
