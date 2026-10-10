"""Day-to-day business expenses. Admin only."""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from ..core.deps import require_admin
from ..database import get_db
from ..models import Expense
from ..schemas.expense import ExpenseIn
from ..utils.dates import local_day_to_utc, parse_day
from ..utils.receipts import remove_receipt, replace_receipt
from ..utils.serialize import expense_to_dict, f2

router = APIRouter(
    prefix="/api/expenses", tags=["expenses"], dependencies=[Depends(require_admin)]
)

# Offered in the category picker; anything else typed is kept as a custom one.
DEFAULT_CATEGORIES = [
    "Rent",
    "Electricity",
    "Gas",
    "Water",
    "Internet & Phone",
    "Salaries & Wages",
    "Transport & Fuel",
    "Food & Tea",
    "Shop Supplies",
    "Repairs & Maintenance",
    "Printing & Stationery",
    "Marketing",
    "Taxes & Fees",
    "Loan / Interest",
    "Personal Drawings",
    "Other",
]


def _load(db: Session, expense_id: int) -> Expense:
    e = (
        db.query(Expense)
        .options(joinedload(Expense.receipt))
        .filter(Expense.id == expense_id)
        .first()
    )
    if not e:
        raise HTTPException(404, "Expense not found.")
    return e


@router.get("/categories")
def categories(db: Session = Depends(get_db)):
    used = [c for (c,) in db.query(Expense.category).distinct().order_by(Expense.category).all()]
    merged = list(DEFAULT_CATEGORIES)
    for c in used:
        if c not in merged:
            merged.insert(-1, c)  # keep "Other" last
    return merged


@router.get("")
def list_expenses(
    q: str | None = None,
    category: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    tz_offset: int = Query(0),
    db: Session = Depends(get_db),
):
    query = db.query(Expense).options(joinedload(Expense.receipt))
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(Expense.category.ilike(like), Expense.paid_to.ilike(like), Expense.note.ilike(like))
        )
    if category:
        query = query.filter(Expense.category == category)
    offset = timedelta(minutes=tz_offset)
    if date_from:
        query = query.filter(Expense.expense_date >= parse_day(date_from) + offset)
    if date_to:
        query = query.filter(Expense.expense_date < parse_day(date_to) + timedelta(days=1) + offset)

    rows = query.order_by(Expense.expense_date.desc(), Expense.id.desc()).limit(2000).all()

    by_cat: dict[str, Decimal] = defaultdict(Decimal)
    total = Decimal("0")
    for e in rows:
        by_cat[e.category] += Decimal(str(e.amount))
        total += Decimal(str(e.amount))

    return {
        "expenses": [expense_to_dict(e) for e in rows],
        "total": f2(total),
        "count": len(rows),
        "by_category": sorted(
            ({"category": c, "amount": f2(a)} for c, a in by_cat.items()),
            key=lambda r: r["amount"],
            reverse=True,
        ),
    }


@router.post("", status_code=201)
def create_expense(payload: ExpenseIn, db: Session = Depends(get_db)):
    e = Expense(
        expense_date=local_day_to_utc(payload.expense_date, payload.tz_offset),
        category=payload.category.strip(),
        amount=Decimal(str(payload.amount)).quantize(Decimal("0.01")),
        paid_to=(payload.paid_to or "").strip() or None,
        note=(payload.note or "").strip() or None,
    )
    db.add(e)
    db.commit()
    return expense_to_dict(_load(db, e.id))


@router.put("/{expense_id}")
def update_expense(expense_id: int, payload: ExpenseIn, db: Session = Depends(get_db)):
    e = _load(db, expense_id)
    if payload.expense_date:
        e.expense_date = local_day_to_utc(payload.expense_date, payload.tz_offset)
    e.category = payload.category.strip()
    e.amount = Decimal(str(payload.amount)).quantize(Decimal("0.01"))
    e.paid_to = (payload.paid_to or "").strip() or None
    e.note = (payload.note or "").strip() or None
    db.commit()
    return expense_to_dict(_load(db, expense_id))


@router.delete("/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    e = _load(db, expense_id)
    remove_receipt(e, db)
    db.delete(e)
    db.commit()
    return {"ok": True}


@router.post("/{expense_id}/receipt")
def upload_receipt(expense_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    e = _load(db, expense_id)
    replace_receipt(e, file, "expense", db)
    db.commit()
    return expense_to_dict(_load(db, expense_id))


@router.delete("/{expense_id}/receipt")
def delete_receipt(expense_id: int, db: Session = Depends(get_db)):
    e = _load(db, expense_id)
    remove_receipt(e, db)
    db.commit()
    return expense_to_dict(_load(db, expense_id))
