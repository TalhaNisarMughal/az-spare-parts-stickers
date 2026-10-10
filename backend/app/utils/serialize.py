from decimal import Decimal

from .receipts import receipt_to_dict


def iso(dt) -> str | None:
    """Naive UTC datetime -> ISO string with Z so browsers render local time."""
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + "Z" if dt else None


def f2(x) -> float | None:
    if x is None:
        return None
    return float(Decimal(str(x)).quantize(Decimal("0.01")))


def customer_to_dict(c) -> dict:
    return {
        "customer_code": c.customer_code,
        "customer_name": c.customer_name,
        "phone_number": c.phone_number,
        "shop_name": c.shop_name,
        "address": c.address,
        "created_at": iso(c.created_at),
    }


def stock_to_dict(s, *, admin: bool = False) -> dict:
    """Cost price is money-sensitive: only the admin sees it."""
    out = {
        "stock_barcode": s.stock_barcode,
        "stock_name": s.stock_name,
        "qty": s.qty,
        "unit_price": f2(s.unit_price),
        "created_at": iso(s.created_at),
    }
    if admin:
        cost = f2(s.cost_price)
        price = f2(s.unit_price) or 0.0
        out["cost_price"] = cost
        out["margin"] = None if cost is None else round(price - cost, 2)
        out["margin_percent"] = (
            None if cost is None or cost == 0 else round((price - cost) / cost * 100, 2)
        )
    return out


def supplier_to_dict(s) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "phone": s.phone,
        "address": s.address,
        "notes": s.notes,
        "created_at": iso(s.created_at),
    }


def purchase_to_dict(p) -> dict:
    sup = p.supplier
    st = p.stock
    return {
        "id": p.id,
        "supplier_id": p.supplier_id,
        "supplier_name": sup.name if sup else None,
        "stock_barcode": p.stock_barcode,
        "stock_name": st.stock_name if st else None,
        "qty": p.qty,
        "cost_price": f2(p.cost_price),
        "total_cost": f2(p.total_cost),
        "paid_amount": f2(p.paid_amount),
        "remaining_balance": f2(p.remaining_balance),
        "status": p.status,
        "purchase_date": iso(p.purchase_date),
        "note": p.note,
        "receipt": receipt_to_dict(p.receipt),
        "created_at": iso(p.created_at),
        "last_modified": iso(p.last_modified),
        "payments": [
            {
                "id": pay.id,
                "amount": f2(pay.amount),
                "payment_date": iso(pay.payment_date),
                "note": pay.note,
            }
            for pay in p.payments
        ],
    }


def expense_to_dict(e) -> dict:
    return {
        "id": e.id,
        "expense_date": iso(e.expense_date),
        "category": e.category,
        "amount": f2(e.amount),
        "paid_to": e.paid_to,
        "note": e.note,
        "receipt": receipt_to_dict(e.receipt),
        "created_at": iso(e.created_at),
    }


def line_cost(it, fallback_costs: dict | None = None):
    """Cost per unit for a bill line: the sale-time snapshot, else the item's
    current average cost (for bills made before cost tracking). None = unknown."""
    if it.cost_price is not None:
        return Decimal(str(it.cost_price))
    fb = (fallback_costs or {}).get(it.stock_barcode)
    return Decimal(str(fb)) if fb is not None else None


def bill_to_dict(b, *, admin: bool = False, fallback_costs: dict | None = None) -> dict:
    c = b.customer
    out = {
        "bill_id": b.bill_id,
        "customer_code": b.customer_code,
        "customer_name": c.customer_name if c else None,
        "customer_phone": c.phone_number if c else None,
        "shop_name": c.shop_name if c else None,
        "salesman_name": b.salesman_name,
        "payment_type": b.payment_type,
        "net_total": f2(b.net_total),
        "deposited_amount": f2(b.deposited_amount),
        "remaining_balance": f2(b.remaining_balance),
        "status": b.status,
        "purchase_date": iso(b.purchase_date),
        "last_modified": iso(b.last_modified),
        "receipt": receipt_to_dict(b.receipt),
        "items": [
            {
                "id": it.id,
                "stock_barcode": it.stock_barcode,
                "item_name": it.item_name,
                "description": it.description,
                "unit_price": f2(it.unit_price),
                "discounted_price": f2(it.discounted_price),
                "discount_percent": f2(it.discount_percent),
                "qty": it.qty,
                "line_total": f2(it.line_total),
            }
            for it in b.items
        ],
        "payments": [
            {
                "id": p.id,
                "amount": f2(p.amount),
                "payment_date": iso(p.payment_date),
                "note": p.note,
            }
            for p in b.payments
        ],
    }
    if admin:
        # Profit per line: line total - cost x qty. Unknown cost on any line
        # makes the bill's profit unknown rather than silently too high.
        total_cost = Decimal("0")
        known = True
        for it, line in zip(b.items, out["items"]):
            cost = line_cost(it, fallback_costs)
            line["cost_price"] = f2(cost)
            if cost is None:
                known = False
                line["profit"] = None
            else:
                lc = cost * it.qty
                total_cost += lc
                line["profit"] = f2(Decimal(str(it.line_total)) - lc)
        out["cost_total"] = f2(total_cost) if known else None
        out["profit"] = f2(Decimal(str(b.net_total)) - total_cost) if known else None
    return out
