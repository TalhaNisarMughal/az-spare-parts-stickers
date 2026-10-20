"""Receivables: what each customer owes, and receiving money against the
whole account instead of bill by bill.

A *settlement* is one amount handed over by a customer. It is spread across
that customer's unpaid bills oldest-first; every slice is a normal BillPayment
row (so the bill slip, the customer ledger and the dashboard all stay exact)
and each bill whose balance reaches zero is closed automatically.
"""
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..core.deps import get_current_user, require_admin
from ..database import get_db
from ..models import Bill, BillPayment, Customer, Settlement, User
from ..schemas.receivable import SettlementIn
from ..utils.dates import local_day_to_utc
from ..utils.pdf import generate_bill_pdf
from ..utils.serialize import f2, iso

router = APIRouter(
    prefix="/api/receivables", tags=["receivables"], dependencies=[Depends(get_current_user)]
)

TWO = Decimal("0.01")
ZERO = Decimal("0.00")


def d2(x) -> Decimal:
    return Decimal(str(x or 0)).quantize(TWO)


# ---------------------------------------------------------------- helpers
def _customer_or_404(db: Session, code: str) -> Customer:
    customer = db.get(Customer, code)
    if not customer:
        raise HTTPException(404, f"Customer '{code}' was not found.")
    return customer


def _customer_bills(db: Session, code: str) -> list[Bill]:
    return (
        db.query(Bill)
        .options(
            joinedload(Bill.items),
            joinedload(Bill.payments),
            joinedload(Bill.customer),
            joinedload(Bill.receipt),
        )
        .filter(Bill.customer_code == code)
        .order_by(Bill.purchase_date, Bill.bill_id)
        .all()
    )


def _bill_brief(b: Bill) -> dict:
    return {
        "bill_id": b.bill_id,
        "purchase_date": iso(b.purchase_date),
        "salesman_name": b.salesman_name,
        "payment_type": b.payment_type,
        "status": b.status,
        "units": sum(it.qty for it in b.items),
        "net_total": f2(b.net_total),
        "deposited_amount": f2(b.deposited_amount),
        "remaining_balance": f2(b.remaining_balance),
    }


def _settlement_dict(s: Settlement) -> dict:
    return {
        "id": s.id,
        "amount": f2(s.amount),
        "payment_date": iso(s.payment_date),
        "note": s.note,
        "created_by": s.created_by,
        "created_at": iso(s.created_at),
        "allocations": [
            {"bill_id": p.bill_id, "amount": f2(p.amount)} for p in s.payments
        ],
    }


def build_detail(db: Session, customer: Customer) -> dict:
    bills = _customer_bills(db, customer.customer_code)
    unpaid = [b for b in bills if d2(b.remaining_balance) > 0]

    settlements = (
        db.query(Settlement)
        .options(joinedload(Settlement.payments))
        .filter(Settlement.customer_code == customer.customer_code)
        .order_by(Settlement.payment_date.desc(), Settlement.id.desc())
        .all()
    )

    # Every receiving, newest first: account-level settlements as one line
    # each, plus deposits that were recorded straight on a bill.
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
                "bills": [{"bill_id": p.bill_id, "amount": f2(p.amount)} for p in s.payments],
                "_dt": s.payment_date,
                "_seq": s.id,
            }
        )
    for b in bills:
        for p in b.payments:
            if p.settlement_id is not None:
                continue
            history.append(
                {
                    "kind": "bill",
                    "id": p.id,
                    "amount": f2(p.amount),
                    "payment_date": iso(p.payment_date),
                    "note": p.note,
                    "created_by": None,
                    "bills": [{"bill_id": b.bill_id, "amount": f2(p.amount)}],
                    "_dt": p.payment_date,
                    "_seq": p.id,
                }
            )
    history.sort(key=lambda h: (h["_dt"], h["_seq"]), reverse=True)
    for h in history:
        h.pop("_dt")
        h.pop("_seq")

    total_billed = sum((d2(b.net_total) for b in bills), ZERO)
    total_paid = sum((d2(b.deposited_amount) for b in bills), ZERO)
    outstanding = sum((d2(b.remaining_balance) for b in bills), ZERO)
    pay_dates = [p.payment_date for b in bills for p in b.payments]

    return {
        "customer": {
            "customer_code": customer.customer_code,
            "customer_name": customer.customer_name,
            "phone_number": customer.phone_number,
            "shop_name": customer.shop_name,
            "address": customer.address,
        },
        "summary": {
            "total_billed": f2(total_billed),
            "total_paid": f2(total_paid),
            "outstanding": f2(outstanding),
            "bills": len(bills),
            "unpaid_bills": len(unpaid),
            "closed_bills": sum(1 for b in bills if b.status == "closed"),
            "first_purchase": iso(bills[0].purchase_date) if bills else None,
            "last_purchase": iso(bills[-1].purchase_date) if bills else None,
            "last_payment": iso(max(pay_dates)) if pay_dates else None,
        },
        "unpaid_bills": [_bill_brief(b) for b in unpaid],  # oldest first = payment order
        "history": history,
    }


# ------------------------------------------------------------------- list
@router.get("")
def list_receivables(db: Session = Depends(get_db)):
    """Every customer with their sold / received / remaining totals."""
    agg = {
        row.customer_code: row
        for row in db.query(
            Bill.customer_code,
            func.count(Bill.bill_id).label("bills"),
            func.coalesce(func.sum(Bill.net_total), 0).label("billed"),
            func.coalesce(func.sum(Bill.deposited_amount), 0).label("paid"),
            func.coalesce(func.sum(Bill.remaining_balance), 0).label("due"),
            func.max(Bill.purchase_date).label("last_purchase"),
        )
        .group_by(Bill.customer_code)
        .all()
    }
    unpaid_counts = dict(
        db.query(Bill.customer_code, func.count(Bill.bill_id))
        .filter(Bill.remaining_balance > 0)
        .group_by(Bill.customer_code)
        .all()
    )
    last_payment = dict(
        db.query(Bill.customer_code, func.max(BillPayment.payment_date))
        .join(BillPayment, BillPayment.bill_id == Bill.bill_id)
        .group_by(Bill.customer_code)
        .all()
    )

    customers = []
    for c in db.query(Customer).order_by(Customer.customer_name).all():
        row = agg.get(c.customer_code)
        customers.append(
            {
                "customer_code": c.customer_code,
                "customer_name": c.customer_name,
                "phone_number": c.phone_number,
                "shop_name": c.shop_name,
                "bills": row.bills if row else 0,
                "unpaid_bills": unpaid_counts.get(c.customer_code, 0),
                "total_billed": f2(row.billed if row else 0),
                "total_paid": f2(row.paid if row else 0),
                "outstanding": f2(row.due if row else 0),
                "last_purchase": iso(row.last_purchase) if row else None,
                "last_payment": iso(last_payment.get(c.customer_code)),
            }
        )

    return {
        "totals": {
            "customers": len(customers),
            "with_dues": sum(1 for c in customers if (c["outstanding"] or 0) > 0),
            "total_billed": f2(sum((d2(c["total_billed"]) for c in customers), ZERO)),
            "total_paid": f2(sum((d2(c["total_paid"]) for c in customers), ZERO)),
            "outstanding": f2(sum((d2(c["outstanding"]) for c in customers), ZERO)),
        },
        "customers": customers,
    }


# ----------------------------------------------------------------- detail
@router.get("/{customer_code}")
def customer_receivable(customer_code: str, db: Session = Depends(get_db)):
    return build_detail(db, _customer_or_404(db, customer_code))


# ------------------------------------------------------------- settlement
@router.post("/{customer_code}/settlements", status_code=201)
def receive_payment(
    customer_code: str,
    payload: SettlementIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record money received from the customer and clear their bills with it.

    The amount is applied to unpaid bills oldest-first. Only bills dated on or
    before the payment date are eligible, so a receiving can never be booked
    against a sale that had not happened yet.
    """
    customer = _customer_or_404(db, customer_code)
    amount = d2(payload.amount)
    if amount <= 0:
        raise HTTPException(400, "Amount received must be more than 0.")

    when = local_day_to_utc(payload.payment_date, payload.tz_offset)
    bills = _customer_bills(db, customer_code)
    unpaid = [b for b in bills if d2(b.remaining_balance) > 0]
    outstanding = sum((d2(b.remaining_balance) for b in unpaid), ZERO)

    if outstanding <= 0:
        raise HTTPException(400, f"{customer.customer_name} has no remaining balance — nothing to receive.")
    if amount > outstanding:
        raise HTTPException(
            400,
            f"Rs {amount:,.2f} is more than the Rs {outstanding:,.2f} this customer owes. "
            "Enter the remaining balance or less.",
        )

    eligible = [b for b in unpaid if b.purchase_date <= when]
    allocatable = sum((d2(b.remaining_balance) for b in eligible), ZERO)
    if amount > allocatable:
        raise HTTPException(
            400,
            f"As of that date the customer owed Rs {allocatable:,.2f}; later bills cannot be "
            f"settled by an earlier payment. Pick a later date or enter Rs {allocatable:,.2f} or less.",
        )

    settlement = Settlement(
        customer_code=customer_code,
        amount=amount,
        payment_date=when,
        note=(payload.note or "").strip() or None,
        created_by=user.full_name or user.email,
    )
    db.add(settlement)
    db.flush()  # need the id for the per-bill notes

    base_note = f"Received on account (#{settlement.id})"
    note = f"{base_note} — {settlement.note}" if settlement.note else base_note

    left = amount
    touched: list[Bill] = []
    allocations: list[dict] = []
    for b in eligible:
        if left <= 0:
            break
        slice_ = min(left, d2(b.remaining_balance))
        b.payments.append(
            BillPayment(
                amount=slice_, payment_date=when, note=note, settlement_id=settlement.id
            )
        )
        b.deposited_amount = (d2(b.deposited_amount) + slice_).quantize(TWO)
        b.remaining_balance = (d2(b.remaining_balance) - slice_).quantize(TWO)
        b.last_modified = datetime.utcnow()
        if b.remaining_balance == 0:
            b.status = "closed"
        left = (left - slice_).quantize(TWO)
        touched.append(b)
        allocations.append(
            {
                "bill_id": b.bill_id,
                "amount": f2(slice_),
                "remaining_after": f2(b.remaining_balance),
                "status": b.status,
            }
        )

    db.commit()

    for b in _customer_bills(db, customer_code):
        if any(b.bill_id == t.bill_id for t in touched):
            generate_bill_pdf(b)  # slips show every deposit, so refresh them

    db.refresh(settlement)
    return {
        "settlement": _settlement_dict(settlement),
        "allocations": allocations,
        "closed_bills": [a["bill_id"] for a in allocations if a["status"] == "closed"],
        "detail": build_detail(db, customer),
    }


@router.delete("/{customer_code}/settlements/{settlement_id}")
def undo_settlement(
    customer_code: str,
    settlement_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Reverse a receiving: its slices come off the bills and closed bills reopen."""
    customer = _customer_or_404(db, customer_code)
    settlement = (
        db.query(Settlement)
        .options(joinedload(Settlement.payments))
        .filter(Settlement.id == settlement_id, Settlement.customer_code == customer_code)
        .first()
    )
    if not settlement:
        raise HTTPException(404, "That receiving was not found for this customer.")

    touched: list[str] = []
    for p in list(settlement.payments):
        bill = db.get(Bill, p.bill_id)
        if bill:
            amt = d2(p.amount)
            if d2(bill.deposited_amount) < amt:
                raise HTTPException(
                    400, f"Cannot undo: bill {bill.bill_id} no longer carries this payment."
                )
            bill.deposited_amount = (d2(bill.deposited_amount) - amt).quantize(TWO)
            bill.remaining_balance = (d2(bill.remaining_balance) + amt).quantize(TWO)
            if bill.remaining_balance > 0:
                bill.status = "open"
            bill.last_modified = datetime.utcnow()
            touched.append(bill.bill_id)
        db.delete(p)
    db.delete(settlement)
    db.commit()

    for b in _customer_bills(db, customer_code):
        if b.bill_id in touched:
            generate_bill_pdf(b)

    return build_detail(db, customer)
