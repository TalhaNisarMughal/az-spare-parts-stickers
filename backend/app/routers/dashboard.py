"""Admin dashboard: how the business is doing over any period.

Everything is computed for a window [start, end) chosen by the user (today,
this month, custom range, …) and compared with the equal-length window just
before it, so every figure can say whether it went up or down.

Profit definitions (counted on the *sale date*, not when the customer pays):
    sales         = sum of bill net totals
    cost of goods = sum over bill lines of cost x qty, using the cost snapshotted
                    at sale time (older lines fall back to the item's current cost)
    gross profit  = sales - cost of goods
    expenses      = everything logged on the Expenses page
    net profit    = gross profit - expenses
"""
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..core.deps import require_admin
from ..database import get_db
from ..models import Bill, BillItem, BillPayment, Customer, Expense, Purchase, PurchasePayment, Stock
from ..utils.costing import current_costs
from ..utils.dates import parse_day
from ..utils.serialize import f2, iso, line_cost

router = APIRouter(
    prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(require_admin)]
)

ZERO = Decimal("0")


def _local(dt: datetime, tz_offset: int) -> datetime:
    """UTC -> user's local time. tz_offset is JS getTimezoneOffset() (UTC - local, minutes)."""
    return dt - timedelta(minutes=tz_offset)


def _window(date_from: str | None, date_to: str | None, tz_offset: int):
    """Local YYYY-MM-DD bounds -> naive UTC [start, end). Defaults to all time."""
    offset = timedelta(minutes=tz_offset)
    start = parse_day(date_from) + offset if date_from else None
    end = parse_day(date_to) + timedelta(days=1) + offset if date_to else None
    if start and end and end <= start:
        raise HTTPException(400, "The 'To' date cannot be before the 'From' date.")
    return start, end


def _between(col, start, end):
    conds = []
    if start:
        conds.append(col >= start)
    if end:
        conds.append(col < end)
    return conds


def _period_metrics(db: Session, start, end, costs: dict) -> dict:
    """All the money figures for one window."""
    bills = (
        db.query(Bill)
        .options(joinedload(Bill.items))
        .filter(*_between(Bill.purchase_date, start, end))
        .all()
    )
    sales = ZERO
    cogs = ZERO
    units = 0
    unknown_cost_lines = 0
    for b in bills:
        sales += Decimal(str(b.net_total))
        for it in b.items:
            units += it.qty
            c = line_cost(it, costs)
            if c is None:
                unknown_cost_lines += 1
            else:
                cogs += c * it.qty

    collected = Decimal(
        str(
            db.query(func.coalesce(func.sum(BillPayment.amount), 0))
            .filter(*_between(BillPayment.payment_date, start, end))
            .scalar()
            or 0
        )
    )
    expenses = Decimal(
        str(
            db.query(func.coalesce(func.sum(Expense.amount), 0))
            .filter(*_between(Expense.expense_date, start, end))
            .scalar()
            or 0
        )
    )
    purchases_cost, purchases_count = (
        db.query(func.coalesce(func.sum(Purchase.total_cost), 0), func.count(Purchase.id))
        .filter(*_between(Purchase.purchase_date, start, end))
        .first()
    )
    paid_suppliers = (
        db.query(func.coalesce(func.sum(PurchasePayment.amount), 0))
        .filter(*_between(PurchasePayment.payment_date, start, end))
        .scalar()
        or 0
    )

    gross = sales - cogs
    net = gross - expenses
    return {
        "bills": len(bills),
        "units_sold": units,
        "sales": f2(sales),
        "cost_of_goods": f2(cogs),
        "gross_profit": f2(gross),
        "gross_margin_percent": f2(gross / sales * 100) if sales > 0 else None,
        "expenses": f2(expenses),
        "net_profit": f2(net),
        "collected": f2(collected),
        "purchases_cost": f2(purchases_cost),
        "purchases": int(purchases_count or 0),
        "paid_to_suppliers": f2(paid_suppliers),
        "unknown_cost_lines": unknown_cost_lines,
        "cash_in": f2(collected),
        "cash_out": f2(Decimal(str(paid_suppliers)) + expenses),
        "cash_net": f2(collected - Decimal(str(paid_suppliers)) - expenses),
    }


def _change(cur: float | None, prev: float | None):
    """Percent change vs the previous period; None when there is nothing to compare to."""
    if cur is None or prev is None or prev == 0:
        return None
    return round((cur - prev) / abs(prev) * 100, 1)


@router.get("/summary")
def summary(
    date_from: str | None = Query(None, description="YYYY-MM-DD (local)"),
    date_to: str | None = Query(None, description="YYYY-MM-DD (local)"),
    tz_offset: int = Query(0),
    db: Session = Depends(get_db),
):
    start, end = _window(date_from, date_to, tz_offset)
    costs = current_costs(db)
    period = _period_metrics(db, start, end, costs)

    # Previous window of equal length, right before this one.
    previous = None
    if start and end:
        length = end - start
        previous = _period_metrics(db, start - length, start, costs)
    compare = {
        k: _change(period[k], previous[k]) if previous else None
        for k in ("sales", "gross_profit", "expenses", "net_profit", "collected", "bills", "units_sold")
    }

    # ---- what sold in the period ------------------------------------------
    sold: dict[str, dict] = {}
    for it in (
        db.query(BillItem)
        .join(Bill, BillItem.bill_id == Bill.bill_id)
        .filter(*_between(Bill.purchase_date, start, end))
        .all()
    ):
        row = sold.setdefault(
            it.stock_barcode,
            {"item_name": it.item_name, "stock_barcode": it.stock_barcode, "qty_sold": 0, "revenue": ZERO, "profit": ZERO, "profit_known": True},
        )
        row["qty_sold"] += it.qty
        row["revenue"] += Decimal(str(it.line_total))
        c = line_cost(it, costs)
        if c is None:
            row["profit_known"] = False
        else:
            row["profit"] += Decimal(str(it.line_total)) - c * it.qty
    items_sold = sorted(
        (
            {**r, "revenue": f2(r["revenue"]), "profit": f2(r["profit"]) if r["profit_known"] else None}
            for r in sold.values()
        ),
        key=lambda r: r["qty_sold"],
        reverse=True,
    )

    # ---- customers in the period -------------------------------------------
    top_customers = [
        {"customer_name": r.customer_name, "customer_code": r.customer_code, "bills": int(r.bills), "billed": f2(r.billed), "paid": f2(r.paid)}
        for r in db.query(
            Customer.customer_name,
            Customer.customer_code,
            func.count(Bill.bill_id).label("bills"),
            func.sum(Bill.net_total).label("billed"),
            func.sum(Bill.deposited_amount).label("paid"),
        )
        .join(Bill, Bill.customer_code == Customer.customer_code)
        .filter(*_between(Bill.purchase_date, start, end))
        .group_by(Customer.customer_name, Customer.customer_code)
        .order_by(func.sum(Bill.net_total).desc())
        .limit(6)
        .all()
    ]

    # ---- expenses in the period --------------------------------------------
    expense_rows = (
        db.query(Expense)
        .filter(*_between(Expense.expense_date, start, end))
        .order_by(Expense.expense_date.desc(), Expense.id.desc())
        .all()
    )
    by_cat: dict[str, Decimal] = defaultdict(Decimal)
    for e in expense_rows:
        by_cat[e.category] += Decimal(str(e.amount))
    expenses_by_category = sorted(
        ({"category": c, "amount": f2(a)} for c, a in by_cat.items()),
        key=lambda r: r["amount"],
        reverse=True,
    )
    recent_expenses = [
        {"id": e.id, "expense_date": iso(e.expense_date), "category": e.category, "amount": f2(e.amount), "paid_to": e.paid_to, "note": e.note}
        for e in expense_rows[:12]
    ]

    # ---- bills in the period (the day's sales list) ------------------------
    period_bills = [
        {
            "bill_id": b.bill_id,
            "purchase_date": iso(b.purchase_date),
            "customer_name": b.customer.customer_name if b.customer else b.customer_code,
            "customer_code": b.customer_code,
            "salesman_name": b.salesman_name,
            "net_total": f2(b.net_total),
            "deposited_amount": f2(b.deposited_amount),
            "remaining_balance": f2(b.remaining_balance),
            "status": b.status,
            "items": sum(it.qty for it in b.items),
        }
        for b in db.query(Bill)
        .options(joinedload(Bill.customer), joinedload(Bill.items))
        .filter(*_between(Bill.purchase_date, start, end))
        .order_by(Bill.purchase_date.desc())
        .limit(12)
        .all()
    ]

    # ---- all-time position --------------------------------------------------
    stock_rows = db.query(Stock.qty, Stock.unit_price, Stock.cost_price).all()
    stock_value_cost = sum((Decimal(str(c)) * q for q, _, c in stock_rows if c is not None), ZERO)
    stock_value_price = sum((Decimal(str(p)) * q for q, p, _ in stock_rows), ZERO)
    all_time = {
        "customers": db.query(func.count(Customer.customer_code)).scalar() or 0,
        "suppliers": db.query(func.count(func.distinct(Purchase.supplier_id))).scalar() or 0,
        "stock_items": len(stock_rows),
        "units_in_stock": int(sum(q for q, _, _ in stock_rows)),
        "stock_value_cost": f2(stock_value_cost),
        "stock_value_price": f2(stock_value_price),
        "items_without_cost": sum(1 for _, _, c in stock_rows if c is None),
        "receivable": f2(db.query(func.coalesce(func.sum(Bill.remaining_balance), 0)).scalar() or 0),
        "payable": f2(db.query(func.coalesce(func.sum(Purchase.remaining_balance), 0)).scalar() or 0),
        "open_bills": db.query(func.count(Bill.bill_id)).filter(Bill.status == "open").scalar() or 0,
        "closed_bills": db.query(func.count(Bill.bill_id)).filter(Bill.status == "closed").scalar() or 0,
        "open_purchases": db.query(func.count(Purchase.id)).filter(Purchase.status == "open").scalar() or 0,
    }

    low_stock = db.query(Stock).filter(Stock.qty <= 5).order_by(Stock.qty.asc()).limit(6).all()

    return {
        "window": {"date_from": date_from, "date_to": date_to},
        "period": period,
        "previous": previous,
        "change": compare,
        "items_sold": items_sold,
        "top_customers": top_customers,
        "expenses_by_category": expenses_by_category,
        "recent_expenses": recent_expenses,
        "bills": period_bills,
        "all_time": all_time,
        "low_stock": [
            {"stock_name": s.stock_name, "stock_barcode": s.stock_barcode, "qty": s.qty} for s in low_stock
        ],
    }


@router.get("/trend")
def trend(
    granularity: str = Query("month", pattern="^(day|week|month|year)$"),
    tz_offset: int = Query(0),
    db: Session = Depends(get_db),
):
    """Sales / cost / gross profit / expenses / net profit / collected per bucket,
    in the user's local time. day -> last 30 days, week -> 12 weeks,
    month -> 12 months, year -> 5 years."""
    now = _local(datetime.utcnow(), tz_offset)

    def day_key(dt):
        return dt.strftime("%Y-%m-%d"), dt.strftime("%d %b")

    def week_key(dt):
        monday = dt - timedelta(days=dt.weekday())
        return monday.strftime("%Y-%m-%d"), "Wk " + monday.strftime("%d %b")

    def month_key(dt):
        return dt.strftime("%Y-%m"), dt.strftime("%b %Y")

    def year_key(dt):
        return dt.strftime("%Y"), dt.strftime("%Y")

    if granularity == "day":
        keyfn, points, step = day_key, 30, timedelta(days=1)
        start = now - timedelta(days=points - 1)
    elif granularity == "week":
        keyfn, points, step = week_key, 12, timedelta(weeks=1)
        start = (now - timedelta(days=now.weekday())) - timedelta(weeks=points - 1)
    elif granularity == "year":
        keyfn, points, step = year_key, 5, None
        start = datetime(now.year - (points - 1), 1, 1)
    else:
        keyfn, points, step = month_key, 12, None
        y, m = now.year, now.month - (points - 1)
        while m <= 0:
            m += 12
            y -= 1
        start = datetime(y, m, 1)

    start_utc = start.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(minutes=tz_offset)
    costs = current_costs(db)

    sales = defaultdict(Decimal)
    cogs = defaultdict(Decimal)
    for b in (
        db.query(Bill).options(joinedload(Bill.items)).filter(Bill.purchase_date >= start_utc).all()
    ):
        k = keyfn(_local(b.purchase_date, tz_offset))[0]
        sales[k] += Decimal(str(b.net_total))
        for it in b.items:
            c = line_cost(it, costs)
            if c is not None:
                cogs[k] += c * it.qty

    collected = defaultdict(Decimal)
    for dt, amount in db.query(BillPayment.payment_date, BillPayment.amount).filter(
        BillPayment.payment_date >= start_utc
    ):
        collected[keyfn(_local(dt, tz_offset))[0]] += Decimal(str(amount))

    expenses = defaultdict(Decimal)
    for dt, amount in db.query(Expense.expense_date, Expense.amount).filter(
        Expense.expense_date >= start_utc
    ):
        expenses[keyfn(_local(dt, tz_offset))[0]] += Decimal(str(amount))

    series = []
    cursor = start
    for i in range(points):
        if granularity == "month":
            y, m = start.year, start.month + i
            while m > 12:
                m -= 12
                y += 1
            cursor = datetime(y, m, 1)
        elif granularity == "year":
            cursor = datetime(start.year + i, 1, 1)
        elif i > 0:
            cursor = cursor + step
        key, label = keyfn(cursor)
        s = sales.get(key, ZERO)
        c = cogs.get(key, ZERO)
        e = expenses.get(key, ZERO)
        series.append(
            {
                "label": label,
                "sales": f2(s),
                "cost_of_goods": f2(c),
                "gross_profit": f2(s - c),
                "expenses": f2(e),
                "net_profit": f2(s - c - e),
                "collected": f2(collected.get(key, ZERO)),
            }
        )
    return {"granularity": granularity, "series": series}
