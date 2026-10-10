"""Purchases: every lot of stock bought from a supplier, what it cost, what has
been paid for it, and what is still owed. Admin only — this is the cost side
of the business."""
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from ..core.deps import require_admin
from ..database import get_db
from ..models import Purchase, PurchasePayment, Stock, Supplier
from ..schemas.purchase import PurchaseCreate, PurchasePaymentIn, PurchaseUpdate
from ..utils.costing import d2, recompute_cost_price
from ..utils.dates import local_day_to_utc, parse_day
from ..utils.receipts import remove_receipt, replace_receipt
from ..utils.serialize import purchase_to_dict
from .suppliers import get_or_create_supplier

router = APIRouter(
    prefix="/api/purchases", tags=["purchases"], dependencies=[Depends(require_admin)]
)


def _load(db: Session, purchase_id: int) -> Purchase:
    p = (
        db.query(Purchase)
        .options(
            joinedload(Purchase.supplier),
            joinedload(Purchase.stock),
            joinedload(Purchase.payments),
            joinedload(Purchase.receipt),
        )
        .filter(Purchase.id == purchase_id)
        .first()
    )
    if not p:
        raise HTTPException(404, "Purchase not found.")
    return p


def _set_money(p: Purchase) -> None:
    p.total_cost = (d2(p.cost_price) * p.qty).quantize(Decimal("0.01"))
    p.remaining_balance = (p.total_cost - d2(p.paid_amount)).quantize(Decimal("0.01"))
    p.status = "closed" if p.remaining_balance <= 0 else "open"


def record_purchase(
    db: Session,
    *,
    stock: Stock,
    supplier: Supplier,
    qty: int,
    cost_price,
    paid_amount,
    when: datetime,
    note: str | None,
) -> Purchase:
    """Create a purchase, add its qty to the store and refresh the item's
    average cost. Shared with the stock router (Add Stock = item + first lot)."""
    cost = d2(cost_price)
    paid = d2(paid_amount)
    total = (cost * qty).quantize(Decimal("0.01"))
    if paid > total:
        raise HTTPException(400, "Paid amount cannot be more than the total cost.")

    p = Purchase(
        supplier_id=supplier.id,
        stock_barcode=stock.stock_barcode,
        qty=qty,
        cost_price=cost,
        paid_amount=paid,
        purchase_date=when,
        note=(note or "").strip() or None,
        created_at=datetime.utcnow(),
        last_modified=datetime.utcnow(),
    )
    _set_money(p)
    if paid > 0:
        p.payments.append(
            PurchasePayment(amount=paid, payment_date=when, note="Paid at purchase")
        )
    db.add(p)
    stock.qty += qty
    db.flush()
    recompute_cost_price(stock, db)
    return p


# ---------------------------------------------------------------------- list
@router.get("")
def list_purchases(
    q: str | None = None,
    supplier_id: int | None = None,
    stock_barcode: str | None = None,
    status: str | None = Query(None, pattern="^(open|closed)$"),
    date_from: str | None = None,
    date_to: str | None = None,
    tz_offset: int = Query(0),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Purchase)
        .join(Supplier, Purchase.supplier_id == Supplier.id)
        .join(Stock, Purchase.stock_barcode == Stock.stock_barcode)
        .options(
            joinedload(Purchase.supplier),
            joinedload(Purchase.stock),
            joinedload(Purchase.payments),
            joinedload(Purchase.receipt),
        )
    )
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Supplier.name.ilike(like),
                Stock.stock_name.ilike(like),
                Purchase.stock_barcode.ilike(like),
                Purchase.note.ilike(like),
            )
        )
    if supplier_id:
        query = query.filter(Purchase.supplier_id == supplier_id)
    if stock_barcode:
        query = query.filter(Purchase.stock_barcode == stock_barcode)
    if status:
        query = query.filter(Purchase.status == status)
    offset = timedelta(minutes=tz_offset)
    if date_from:
        query = query.filter(Purchase.purchase_date >= parse_day(date_from) + offset)
    if date_to:
        query = query.filter(Purchase.purchase_date < parse_day(date_to) + timedelta(days=1) + offset)

    rows = query.order_by(Purchase.purchase_date.desc(), Purchase.id.desc()).limit(1000).all()
    return [purchase_to_dict(p) for p in rows]


# -------------------------------------------------------------------- create
@router.post("", status_code=201)
def create_purchase(payload: PurchaseCreate, db: Session = Depends(get_db)):
    stock = db.get(Stock, payload.stock_barcode.strip())
    if not stock:
        raise HTTPException(404, "Item not found in the store.")
    supplier = get_or_create_supplier(db, payload.supplier_id, payload.new_supplier)
    when = local_day_to_utc(payload.purchase_date, payload.tz_offset)
    p = record_purchase(
        db,
        stock=stock,
        supplier=supplier,
        qty=payload.qty,
        cost_price=payload.cost_price,
        paid_amount=payload.paid_amount,
        when=when,
        note=payload.note,
    )
    db.commit()
    return purchase_to_dict(_load(db, p.id))


# ---------------------------------------------------------------- edit/delete
@router.get("/{purchase_id}")
def get_purchase(purchase_id: int, db: Session = Depends(get_db)):
    return purchase_to_dict(_load(db, purchase_id))


@router.put("/{purchase_id}")
def update_purchase(purchase_id: int, payload: PurchaseUpdate, db: Session = Depends(get_db)):
    p = _load(db, purchase_id)
    stock = db.get(Stock, p.stock_barcode)
    supplier = db.get(Supplier, payload.supplier_id)
    if not supplier:
        raise HTTPException(404, "Selected supplier was not found.")

    delta = payload.qty - p.qty
    if stock and stock.qty + delta < 0:
        raise HTTPException(
            400,
            f"Cannot reduce this purchase to {payload.qty}: {p.qty - stock.qty} unit(s) of "
            f"the original lot have already been sold.",
        )

    p.supplier_id = supplier.id
    p.qty = payload.qty
    p.cost_price = d2(payload.cost_price)
    p.note = (payload.note or "").strip() or None
    if payload.purchase_date:
        p.purchase_date = local_day_to_utc(payload.purchase_date, payload.tz_offset)
    _set_money(p)
    if p.remaining_balance < 0:
        raise HTTPException(
            400,
            f"The new total (Rs {p.total_cost}) is less than what has already been paid "
            f"(Rs {p.paid_amount}).",
        )
    p.last_modified = datetime.utcnow()
    if stock:
        stock.qty += delta
        db.flush()
        recompute_cost_price(stock, db)
    db.commit()
    return purchase_to_dict(_load(db, purchase_id))


@router.delete("/{purchase_id}")
def delete_purchase(purchase_id: int, db: Session = Depends(get_db)):
    p = _load(db, purchase_id)
    stock = db.get(Stock, p.stock_barcode)
    if stock and stock.qty - p.qty < 0:
        raise HTTPException(
            400,
            f"Cannot delete: {p.qty - stock.qty} unit(s) from this lot have already been sold. "
            "Edit the quantity instead.",
        )
    if stock:
        stock.qty -= p.qty
    remove_receipt(p, db)
    db.delete(p)
    db.flush()
    if stock:
        recompute_cost_price(stock, db)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ payments
@router.post("/{purchase_id}/payments")
def add_payment(purchase_id: int, payload: PurchasePaymentIn, db: Session = Depends(get_db)):
    p = _load(db, purchase_id)
    amount = d2(payload.amount)
    if amount > p.remaining_balance:
        raise HTTPException(
            400,
            f"Payment of Rs {amount} is more than the remaining balance of Rs {p.remaining_balance}.",
        )
    when = local_day_to_utc(payload.payment_date, payload.tz_offset)
    p.payments.append(
        PurchasePayment(amount=amount, payment_date=when, note=(payload.note or "").strip() or None)
    )
    p.paid_amount = (d2(p.paid_amount) + amount).quantize(Decimal("0.01"))
    _set_money(p)
    p.last_modified = datetime.utcnow()
    db.commit()
    return purchase_to_dict(_load(db, purchase_id))


# ------------------------------------------------------------------- receipt
@router.post("/{purchase_id}/receipt")
def upload_receipt(purchase_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    p = _load(db, purchase_id)
    replace_receipt(p, file, "purchase", db)
    p.last_modified = datetime.utcnow()
    db.commit()
    return purchase_to_dict(_load(db, purchase_id))


@router.delete("/{purchase_id}/receipt")
def delete_receipt(purchase_id: int, db: Session = Depends(get_db)):
    p = _load(db, purchase_id)
    remove_receipt(p, db)
    p.last_modified = datetime.utcnow()
    db.commit()
    return purchase_to_dict(_load(db, purchase_id))
