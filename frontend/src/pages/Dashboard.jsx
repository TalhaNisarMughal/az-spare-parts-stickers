import { ArrowDownRight, ArrowUpRight, Eye, EyeOff, Minus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import api, { apiError, fmtDay, fmtMoney, isoDay, tzOffset } from '../api/client'
import { useToast } from '../context/ToastContext'

// Series colours — validated as a categorical set in this order (blue, green,
// purple, amber) so adjacent lines stay apart under colour-blindness.
const SERIES = [
  { key: 'sales', name: 'Sales', color: '#1D5BD8' },
  { key: 'gross_profit', name: 'Gross profit', color: '#067647' },
  { key: 'net_profit', name: 'Net profit', color: '#6B3FA0' },
  { key: 'expenses', name: 'Expenses', color: '#B45309' },
]

const GRANULARITIES = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'year', label: 'Yearly' },
]

const startOfWeek = (d) => {
  const s = new Date(d)
  s.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // Monday
  return s
}
const monthRange = (y, m) => [isoDay(new Date(y, m, 1)), isoDay(new Date(y, m + 1, 0))]

const PERIODS = [
  { key: 'today', label: 'Today', range: () => [isoDay(), isoDay()] },
  { key: 'yesterday', label: 'Yesterday', range: () => { const d = new Date(); d.setDate(d.getDate() - 1); return [isoDay(d), isoDay(d)] } },
  { key: 'week', label: 'This week', range: () => [isoDay(startOfWeek(new Date())), isoDay()] },
  { key: 'month', label: 'This month', range: () => { const n = new Date(); return monthRange(n.getFullYear(), n.getMonth()) } },
  { key: 'last_month', label: 'Last month', range: () => { const n = new Date(); return monthRange(n.getFullYear(), n.getMonth() - 1) } },
  { key: 'year', label: 'This year', range: () => { const y = new Date().getFullYear(); return [`${y}-01-01`, isoDay()] } },
  { key: 'last_year', label: 'Last year', range: () => { const y = new Date().getFullYear() - 1; return [`${y}-01-01`, `${y}-12-31`] } },
  { key: 'all', label: 'All time', range: () => ['', ''] },
]

const tooltipStyle = {
  background: '#fff',
  border: '1px solid #E3E0D6',
  borderRadius: 8,
  fontSize: 12.5,
  fontFamily: 'Public Sans, sans-serif',
}

/** A money figure that is blurred until the owner reveals the dashboard. */
function Money({ v, hidden, className = '' }) {
  return <span className={`money ${hidden ? 'money--hidden' : ''} ${className}`}>{fmtMoney(v)}</span>
}

function Delta({ pct, invert = false }) {
  if (pct == null) return <span className="delta delta--none"><Minus size={12} /> no previous period</span>
  const up = pct > 0
  const good = invert ? !up : up
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`delta ${pct === 0 ? 'delta--none' : good ? 'delta--good' : 'delta--bad'}`}>
      <Icon size={13} /> {Math.abs(pct).toFixed(1)}% vs previous period
    </span>
  )
}

function StatCard({ label, value, sub, accent, hidden, money = true, delta, invert }) {
  return (
    <div className={`stat-card ${accent ? `stat-card--${accent}` : ''}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{money ? <Money v={value} hidden={hidden} /> : value}</strong>
      {delta !== undefined && <Delta pct={delta} invert={invert} />}
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

export default function Dashboard() {
  const toast = useToast()
  const navigate = useNavigate()
  const [hidden, setHidden] = useState(true) // finances are private by default, every load
  const [period, setPeriod] = useState('month')
  const [custom, setCustom] = useState(['', ''])
  const [summary, setSummary] = useState(null)
  const [series, setSeries] = useState([])
  const [granularity, setGranularity] = useState('month')
  const [loading, setLoading] = useState(true)

  const [dateFrom, dateTo] = useMemo(
    () => (period === 'custom' ? custom : PERIODS.find((p) => p.key === period).range()),
    [period, custom]
  )

  useEffect(() => {
    if (period === 'custom' && !dateFrom && !dateTo) return
    setLoading(true)
    api
      .get('/dashboard/summary', { params: { date_from: dateFrom || undefined, date_to: dateTo || undefined, tz_offset: tzOffset() } })
      .then(({ data }) => setSummary(data))
      .catch((err) => toast.error(apiError(err)))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo]) // eslint-disable-line

  useEffect(() => {
    api
      .get('/dashboard/trend', { params: { granularity, tz_offset: tzOffset() } })
      .then(({ data }) => setSeries(data.series))
      .catch((err) => toast.error(apiError(err)))
  }, [granularity]) // eslint-disable-line

  const periodLabel =
    period === 'custom'
      ? `${dateFrom ? fmtDay(dateFrom) : 'start'} → ${dateTo ? fmtDay(dateTo) : 'today'}`
      : PERIODS.find((p) => p.key === period).label.toLowerCase()

  const p = summary?.period
  const a = summary?.all_time
  const money = (v) => (hidden ? '••••' : fmtMoney(v))

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="page-sub">How the business is doing — sales, profit, expenses and what is owed, for any period.</p>
        </div>
        <button className={`btn ${hidden ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setHidden((h) => !h)} title={hidden ? 'Reveal all money figures' : 'Hide money figures'}>
          {hidden ? <Eye size={16} /> : <EyeOff size={16} />} {hidden ? 'Show finances' : 'Hide finances'}
        </button>
      </header>

      {/* ---------------- period filter ---------------- */}
      <div className="card period-bar">
        <div className="segmented period-segmented">
          {PERIODS.map((pr) => (
            <button key={pr.key} className={period === pr.key ? 'active' : ''} onClick={() => setPeriod(pr.key)}>{pr.label}</button>
          ))}
          <button className={period === 'custom' ? 'active' : ''} onClick={() => setPeriod('custom')}>Custom</button>
        </div>
        {period === 'custom' && (
          <div className="period-custom">
            <label className="filter-field">
              <span>From</span>
              <input type="date" value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} />
            </label>
            <label className="filter-field">
              <span>To</span>
              <input type="date" value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} />
            </label>
          </div>
        )}
      </div>

      {!summary ? (
        <div className="card"><p className="empty-note">{loading ? 'Loading analytics…' : 'Pick a period to begin.'}</p></div>
      ) : (
        <div className={loading ? 'is-refreshing' : ''}>
          {/* ---------------- headline figures for the period ---------------- */}
          <h2 className="dash-section-title">Showing <b>{periodLabel}</b></h2>
          <div className="stat-grid">
            <StatCard label="Sales" value={p.sales} hidden={hidden} accent="blue" delta={summary.change.sales} sub={`${p.bills} bill(s) · ${p.units_sold} unit(s) sold`} />
            <StatCard label="Gross profit" value={p.gross_profit} hidden={hidden} accent="green" delta={summary.change.gross_profit}
              sub={p.gross_margin_percent != null ? `${p.gross_margin_percent}% margin · cost of goods ${money(p.cost_of_goods)}` : 'sales − cost of goods'} />
            <StatCard label="Expenses" value={p.expenses} hidden={hidden} accent="amber" delta={summary.change.expenses} invert sub="logged on the Expenses page" />
            <StatCard label="Net profit" value={p.net_profit} hidden={hidden} accent={p.net_profit >= 0 ? 'green' : 'red'} delta={summary.change.net_profit}
              sub={p.net_profit >= 0 ? 'gross profit − expenses · a profitable period' : 'gross profit − expenses · a loss this period'} />
            <StatCard label="Cash collected" value={p.collected} hidden={hidden} delta={summary.change.collected} sub="deposits received from customers" />
            <StatCard label="Cash out" value={p.cash_out} hidden={hidden} sub={`${money(p.paid_to_suppliers)} to suppliers + ${money(p.expenses)} expenses`} />
            <StatCard label="Stock bought" value={p.purchases_cost} hidden={hidden} sub={`${p.purchases} purchase(s) from suppliers`} />
          </div>
          {p.unknown_cost_lines > 0 && (
            <p className="dash-warning">
              {p.unknown_cost_lines} sold line(s) in this period have no cost price, so profit here is higher than reality. Set cost prices in the Store to fix it.
            </p>
          )}

          {/* ---------------- all-time position ---------------- */}
          <h2 className="dash-section-title">Where you stand <span className="td-muted">(all time)</span></h2>
          <div className="stat-grid">
            <StatCard label="Customers owe you" value={a.receivable} hidden={hidden} accent="amber" sub={`${a.open_bills} open · ${a.closed_bills} closed ledgers`} />
            <StatCard label="You owe suppliers" value={a.payable} hidden={hidden} accent="amber" sub={`${a.open_purchases} unpaid purchase(s)`} />
            <StatCard label="Stock value (at cost)" value={a.stock_value_cost} hidden={hidden}
              sub={`${a.units_in_stock} units · worth ${money(a.stock_value_price)} at selling price${a.items_without_cost ? ` · ${a.items_without_cost} item(s) missing cost` : ''}`} />
            <StatCard label="Customers · Items" value={`${a.customers} · ${a.stock_items}`} money={false} sub={`${a.suppliers} supplier(s)`} />
          </div>

          {/* ---------------- trend ---------------- */}
          <div className="card chart-card">
            <div className="card-title-row">
              <div>
                <h2>Is the business growing?</h2>
                <p className="page-sub">Sales, gross profit, net profit and expenses over time. Profit is counted on the sale date.</p>
              </div>
              <div className="segmented">
                {GRANULARITIES.map((g) => (
                  <button key={g.key} className={granularity === g.key ? 'active' : ''} onClick={() => setGranularity(g.key)}>{g.label}</button>
                ))}
              </div>
            </div>
            <div className={hidden ? 'money--hidden chart-hidden' : ''}>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={series} margin={{ top: 10, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke="#EBE8DE" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: '#5B6472' }} tickLine={false} axisLine={{ stroke: '#E3E0D6' }} />
                  <YAxis tick={{ fontSize: 11.5, fill: '#5B6472' }} tickLine={false} axisLine={false} width={76} tickFormatter={(v) => (hidden ? '' : Number(v).toLocaleString('en-PK'))} />
                  <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={tooltipStyle} cursor={{ stroke: '#9fb0d0', strokeWidth: 1 }} />
                  <Legend wrapperStyle={{ fontSize: 12.5 }} iconType="plainline" />
                  {SERIES.map((s) => (
                    <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {hidden && <p className="field-note">Figures are hidden — use “Show finances” to reveal the chart.</p>}
          </div>

          {/* ---------------- period detail ---------------- */}
          <div className="dash-grid">
            <div className="card">
              <div className="card-title-row">
                <h2>What sold ({periodLabel})</h2>
                <span className="ledger-count">{summary.items_sold.length} item(s)</span>
              </div>
              {summary.items_sold.length === 0 ? (
                <p className="empty-note">Nothing sold in this period.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Item</th><th className="th-num">Units</th><th className="th-num">Sales</th><th className="th-num">Profit</th></tr>
                    </thead>
                    <tbody>
                      {summary.items_sold.slice(0, 10).map((it) => (
                        <tr key={it.stock_barcode}>
                          <td><button className="link-btn td-strong" onClick={() => navigate(`/ledgers?tab=item&id=${encodeURIComponent(it.stock_barcode)}`)}>{it.item_name}</button></td>
                          <td className="td-num mono">{it.qty_sold}</td>
                          <td className="td-num mono"><Money v={it.revenue} hidden={hidden} /></td>
                          <td className={`td-num mono ${it.profit == null ? 'td-muted' : it.profit < 0 ? 'amount-due' : 'amount-clear'}`}>
                            {it.profit == null ? '—' : <Money v={it.profit} hidden={hidden} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-title-row">
                <h2>Where the money went ({periodLabel})</h2>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/expenses')}>Open Expenses</button>
              </div>
              {summary.expenses_by_category.length === 0 ? (
                <p className="empty-note">No expenses logged in this period.</p>
              ) : (
                <>
                  <ul className="cat-bars">
                    {summary.expenses_by_category.map((c) => (
                      <li key={c.category}>
                        <div className="cat-bar-head">
                          <span>{c.category}</span>
                          <Money v={c.amount} hidden={hidden} className="mono" />
                        </div>
                        <div className="cat-bar-track"><div className="cat-bar-fill" style={{ width: `${Math.max((c.amount / p.expenses) * 100, 2)}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                  <ul className="rank-list rank-list--compact">
                    {summary.recent_expenses.slice(0, 6).map((e) => (
                      <li key={e.id}>
                        <div className="rank-meta">
                          <strong>{e.category}{e.paid_to ? ` · ${e.paid_to}` : ''}</strong>
                          <span className="td-muted">{fmtDay(e.expense_date)}{e.note ? ` · ${e.note}` : ''}</span>
                        </div>
                        <span className="rank-value mono"><Money v={e.amount} hidden={hidden} /></span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="card">
              <div className="card-title-row">
                <h2>Bills ({periodLabel})</h2>
                <span className="ledger-count">{p.bills} bill(s)</span>
              </div>
              {summary.bills.length === 0 ? (
                <p className="empty-note">No bills in this period.</p>
              ) : (
                <ul className="rank-list rank-list--compact">
                  {summary.bills.map((b) => (
                    <li key={b.bill_id}>
                      <div className="rank-meta">
                        <strong>
                          <button className="link-btn" onClick={() => navigate(`/ledgers?tab=customer&id=${encodeURIComponent(b.customer_code)}`)}>{b.customer_name}</button>
                        </strong>
                        <span className="td-muted mono">{b.bill_id} · {fmtDay(b.purchase_date)} · {b.items} unit(s) · {b.salesman_name}</span>
                      </div>
                      <span className="rank-value mono">
                        <Money v={b.net_total} hidden={hidden} />
                        {b.remaining_balance > 0 && <span className="td-muted"> · due <Money v={b.remaining_balance} hidden={hidden} /></span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card">
              <div className="card-title-row">
                <h2>Top customers ({periodLabel})</h2>
              </div>
              {summary.top_customers.length === 0 ? (
                <p className="empty-note">No sales in this period.</p>
              ) : (
                <ol className="rank-list">
                  {summary.top_customers.map((c, i) => (
                    <li key={c.customer_code}>
                      <span className="rank-no">{i + 1}</span>
                      <div className="rank-meta">
                        <strong><button className="link-btn" onClick={() => navigate(`/ledgers?tab=customer&id=${encodeURIComponent(c.customer_code)}`)}>{c.customer_name}</button></strong>
                        <span className="td-muted">{c.bills} bill(s) · paid <Money v={c.paid} hidden={hidden} /></span>
                      </div>
                      <span className="rank-value mono"><Money v={c.billed} hidden={hidden} /></span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="card">
              <div className="card-title-row">
                <h2>Low stock — restock soon</h2>
              </div>
              {summary.low_stock.length === 0 ? (
                <p className="empty-note">Everything is well stocked.</p>
              ) : (
                <ul className="low-stock-list">
                  {summary.low_stock.map((s) => (
                    <li key={s.stock_barcode}>
                      <div className="rank-meta">
                        <strong>{s.stock_name}</strong>
                        <span className="td-muted mono">{s.stock_barcode}</span>
                      </div>
                      <span className={`qty-pill ${s.qty === 0 ? 'qty-out' : 'qty-low'}`}>{s.qty} left</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
