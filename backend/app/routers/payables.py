"""Payables: what the shop owes each supplier, and paying money against the
whole account instead of purchase by purchase.

The mirror of receivables. A *supplier settlement* is one amount handed to a
supplier. It is spread across that supplier's unpaid purchases oldest-first;
every slice is a normal PurchasePayment row (so the supplier ledger and the
dashboard stay exact) and each purchase whose balance reaches zero is closed
automatically. Admin only — this is the cost side of the business.
"""
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..core.deps import require_admin
from ..database import get_db
from ..models import Purchase, PurchasePayment, Supplier, SupplierSettlement, User
from ..schemas.receivable import SettlementIn
from ..utils.dates import local_day_to_utc
from ..utils.serialize import f2, iso

router = APIRouter(
    prefix="/api/payables", tags=["payables"], dependencies=[Depends(require_admin)]
)

TWO = Decimal("0.01")
ZERO = Decimal("0.00")


def d2(x) -> Decimal:
    return Decimal(str(x or 0)).quantize(TWO)


# ---------------------------------------------------------------- helpers
def _supplier_or_404(db: Session, supplier_id: int) -> Supplier:
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(404, "Supplier was not found.")
    return supplier


def _supplier_purchases(db: Session, supplier_id: int) -> list[Purchase]:
    return (
        db.query(Purchase)
        .options(
            joinedload(Purchase.payments),
            joinedload(Purchase.stock),
            joinedload(Purchase.receipt),
        )
        .filter(Purchase.supplier_id == supplier_id)
        .order_by(Purchase.purchase_date, Purchase.id)
        .all()
    )


def _purchase_brief(p: Purchase) -> dict:
    return {
        "id": p.id,
        "purchase_date": iso(p.purchase_date),
        "stock_barcode": p.stock_barcode,
        "stock_name": p.stock.stock_name if p.stock else p.stock_barcode,
        "qty": p.qty,
        "cost_price": f2(p.cost_price),
        "status": p.status,
        "total_cost": f2(p.total_cost),
        "paid_amount": f2(p.paid_amount),
        "remaining_balance": f2(p.remaining_balance),
        "has_receipt": p.receipt is not None,
    }


def _settlement_dict(s: SupplierSettlement) -> dict:
    return {
        "id": s.id,
        "amount": f2(s.amount),
        "payment_date": iso(s.payment_date),
        "note": s.note,
        "created_by": s.created_by,
        "created_at": iso(s.created_at),
        "allocations": [
            {"purchase_id": p.purchase_id, "amount": f2(p.amount)} for p in s.payments
        ],
    }


def build_detail(db: Session, supplier: Supplier) -> dict:
    purchases = _supplier_purchases(db, supplier.id)
    unpaid = [p for p in purchases if d2(p.remaining_balance) > 0]
    by_id = {p.id: p for p in purchases}

    def label(purchase_id: int) -> str:
        p = by_id.get(purchase_id)
        if not p:
            return f"#{purchase_id}"
        name = p.stock.stock_name if p.stock else p.stock_barcode
        return f"{name} × {p.qty}"

    settlements = (
        db.query(SupplierSettlement)
        .options(joinedload(SupplierSettlement.payments))
        .filter(SupplierSettlement.supplier_id == supplier.id)
        .order_by(SupplierSettlement.payment_date.desc(), SupplierSettlement.id.desc())
        .all()
    )

    # Every payment, newest first: account-level settlements as one line
    # each, plus payments that were recorded straight on a purchase.
    history: list[dict] = []
    for s in settlements:
        history.append(
            {
                "kind": "settlement",
                "id": s.id,
                "amount": f2(s.amount),
                "payment_date": iso(s.payment_date),
                "note": s.note,
                "created_by": s.created_by,
                "purchases": [
                    {
                        "purchase_id": p.purchase_id,
                        "label": label(p.purchase_id),
                        "amount": f2(p.amount),
                    }
                    for p in s.payments
                ],
                "_dt": s.payment_date,
                "_seq": s.id,
            }
        )
    for p in purchases:
        for pay in p.payments:
            if pay.settlement_id is not None:
                continue
            history.append(
                {
                    "kind": "purchase",
                    "id": pay.id,
                    "amount": f2(pay.amount),
                    "payment_date": iso(pay.payment_date),
                    "note": pay.note,
                    "created_by": None,
                    "purchases": [
                        {"purchase_id": p.id, "label": label(p.id), "amount": f2(pay.amount)}
                    ],
                    "_dt": pay.payment_date,
                    "_seq": pay.id,
                }
            )
    history.sort(key=lambda h: (h["_dt"], h["_seq"]), reverse=True)
    for h in history:
        h.pop("_dt")
        h.pop("_seq")

    total_bought = sum((d2(p.total_cost) for p in purchases), ZERO)
    total_paid = sum((d2(p.paid_amount) for p in purchases), ZERO)
    outstanding = sum((d2(p.remaining_balance) for p in purchases), ZERO)
    pay_dates = [pay.payment_date for p in purchases for pay in p.payments]

    return {
        "supplier": {
            "id": supplier.id,
            "name": supplier.name,
            "phone": supplier.phone,
            "address": supplier.address,
            "notes": supplier.notes,
        },
        "summary": {
            "total_bought": f2(total_bought),
            "total_paid": f2(total_paid),
            "outstanding": f2(outstanding),
            "purchases": len(purchases),
            "unpaid_purchases": len(unpaid),
            "closed_purchases": sum(1 for p in purchases if p.status == "closed"),
            "units": sum(p.qty for p in purchases),
            "first_purchase": iso(purchases[0].purchase_date) if purchases else None,
            "last_purchase": iso(purchases[-1].purchase_date) if purchases else None,
            "last_payment": iso(max(pay_dates)) if pay_dates else None,
        },
        "unpaid_purchases": [_purchase_brief(p) for p in unpaid],  # oldest first = payment order
        "history": history,
    }


# ------------------------------------------------------------------- list
@router.get("")
def list_payables(db: Session = Depends(get_db)):
    """Every supplier with their bought / paid / remaining totals."""
    agg = {
        row.supplier_id: row
        for row in db.query(
            Purchase.supplier_id,
            func.count(Purchase.id).label("purchases"),
            func.coalesce(func.sum(Purchase.total_cost), 0).label("bought"),
            func.coalesce(func.sum(Purchase.paid_amount), 0).label("paid"),
            func.coalesce(func.sum(Purchase.remaining_balance), 0).label("due"),
            func.max(Purchase.purchase_date).label("last_purchase"),
        )
        .group_by(Purchase.supplier_id)
        .all()
    }
    unpaid_counts = dict(
        db.query(Purchase.supplier_id, func.count(Purchase.id))
        .filter(Purchase.remaining_balance > 0)
        .group_by(Purchase.supplier_id)
        .all()
    )
    last_payment = dict(
        db.query(Purchase.supplier_id, func.max(PurchasePayment.payment_date))
        .join(PurchasePayment, PurchasePayment.purchase_id == Purchase.id)
        .group_by(Purchase.supplier_id)
        .all()
    )

    suppliers = []
    for s in db.query(Supplier).order_by(Supplier.name).all():
        row = agg.get(s.id)
        suppliers.append(
            {
                "id": s.id,
                "name": s.name,
                "phone": s.phone,
                "address": s.address,
                "purchases": row.purchases if row else 0,
                "unpaid_purchases": unpaid_counts.get(s.id, 0),
                "total_bought": f2(row.bought if row else 0),
                "total_paid": f2(row.paid if row else 0),
                "outstanding": f2(row.due if row else 0),
                "last_purchase": iso(row.last_purchase) if row else None,
                "last_payment": iso(last_payment.get(s.id)),
            }
        )

    return {
        "totals": {
            "suppliers": len(suppliers),
            "with_dues": sum(1 for s in suppliers if (s["outstanding"] or 0) > 0),
            "total_bought": f2(sum((d2(s["total_bought"]) for s in suppliers), ZERO)),
            "total_paid": f2(sum((d2(s["total_paid"]) for s in suppliers), ZERO)),
            "outstanding": f2(sum((d2(s["outstanding"]) for s in suppliers), ZERO)),
        },
        "suppliers": suppliers,
    }


# ----------------------------------------------------------------- detail
@router.get("/{supplier_id}")
def supplier_payable(supplier_id: int, db: Session = Depends(get_db)):
    return build_detail(db, _supplier_or_404(db, supplier_id))


# ------------------------------------------------------------- settlement
@router.post("/{supplier_id}/settlements", status_code=201)
def pay_supplier(
    supplier_id: int,
    payload: SettlementIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Record money paid to the supplier and clear their purchases with it.

    The amount is applied to unpaid purchases oldest-first. Only purchases
    dated on or before the payment date are eligible, so a payment can never
    be booked against stock that had not been bought yet.
    """
    supplier = _supplier_or_404(db, supplier_id)
    amount = d2(payload.amount)
    if amount <= 0:
        raise HTTPException(400, "Amount paid must be more than 0.")

    when = local_day_to_utc(payload.payment_date, payload.tz_offset)
    purchases = _supplier_purchases(db, supplier_id)
    unpaid = [p for p in purchases if d2(p.remaining_balance) > 0]
    outstanding = sum((d2(p.remaining_balance) for p in unpaid), ZERO)

    if outstanding <= 0:
        raise HTTPException(400, f"Nothing is owed to {supplier.name} — there is nothing to pay.")
    if amount > outstanding:
        raise HTTPException(
            400,
            f"Rs {amount:,.2f} is more than the Rs {outstanding:,.2f} owed to this supplier. "
            "Enter the remaining balance or less.",
        )

    eligible = [p for p in unpaid if p.purchase_date <= when]
    allocatable = sum((d2(p.remaining_balance) for p in eligible), ZERO)
    if amount > allocatable:
        raise HTTPException(
            400,
            f"As of that date you owed this supplier Rs {allocatable:,.2f}; later purchases cannot "
            f"be settled by an earlier payment. Pick a later date or enter Rs {allocatable:,.2f} or less.",
        )

    settlement = SupplierSettlement(
        supplier_id=supplier_id,
        amount=amount,
        payment_date=when,
        note=(payload.note or "").strip() or None,
        created_by=user.full_name or user.email,
    )
    db.add(settlement)
    db.flush()  # need the id for the per-purchase notes

    base_note = f"Paid on account (#{settlement.id})"
    note = f"{base_note} — {settlement.note}" if settlement.note else base_note

    left = amount
    allocations: list[dict] = []
    for p in eligible:
        if left <= 0:
            break
        slice_ = min(left, d2(p.remaining_balance))
        p.payments.append(
            PurchasePayment(
                amount=slice_, payment_date=when, note=note, settlement_id=settlement.id
            )
        )
        p.paid_amount = (d2(p.paid_amount) + slice_).quantize(TWO)
        p.remaining_balance = (d2(p.remaining_balance) - slice_).quantize(TWO)
        p.last_modified = datetime.utcnow()
        if p.remaining_balance == 0:
            p.status = "closed"
        left = (left - slice_).quantize(TWO)
        allocations.append(
            {
                "purchase_id": p.id,
                "label": f"{p.stock.stock_name if p.stock else p.stock_barcode} × {p.qty}",
                "amount": f2(slice_),
                "remaining_after": f2(p.remaining_balance),
                "status": p.status,
            }
        )

    db.commit()
    db.refresh(settlement)
    return {
        "settlement": _settlement_dict(settlement),
        "allocations": allocations,
        "closed_purchases": [a["purchase_id"] for a in allocations if a["status"] == "closed"],
        "detail": build_detail(db, supplier),
    }


@router.delete("/{supplier_id}/settlements/{settlement_id}")
def undo_settlement(
    supplier_id: int,
    settlement_id: int,
    db: Session = Depends(get_db),
):
    """Reverse a payment: its slices come off the purchases and closed ones reopen."""
    supplier = _supplier_or_404(db, supplier_id)
    settlement = (
        db.query(SupplierSettlement)
        .options(joinedload(SupplierSettlement.payments))
        .filter(
            SupplierSettlement.id == settlement_id,
            SupplierSettlement.supplier_id == supplier_id,
        )
        .first()
    )
    if not settlement:
        raise HTTPException(404, "That payment was not found for this supplier.")

    for pay in list(settlement.payments):
        purchase = db.get(Purchase, pay.purchase_id)
        if purchase:
            amt = d2(pay.amount)
            if d2(purchase.paid_amount) < amt:
                raise HTTPException(
                    400, f"Cannot undo: purchase #{purchase.id} no longer carries this payment."
                )
            purchase.paid_amount = (d2(purchase.paid_amount) - amt).quantize(TWO)
            purchase.remaining_balance = (d2(purchase.remaining_balance) + amt).quantize(TWO)
            if purchase.remaining_balance > 0:
                purchase.status = "open"
            purchase.last_modified = datetime.utcnow()
        db.delete(pay)
    db.delete(settlement)
    db.commit()

    return build_detail(db, supplier)
