from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.deps import get_current_user
from ..database import get_db
from ..models import BillItem, Purchase, Stock, User
from ..schemas.common import StockCreate, StockUpdate
from ..utils.dates import local_day_to_utc
from ..utils.serialize import stock_to_dict
from ..utils.tables import import_stock, read_upload, template_response
from .purchases import record_purchase
from .suppliers import get_or_create_supplier

router = APIRouter(prefix="/api/stock", tags=["stock"])


def d2(x) -> Decimal:
    return Decimal(str(x)).quantize(Decimal("0.01"))


@router.get("/template")
def download_template(
    format: str = Query("csv", pattern="^(csv|xlsx)$"), user: User = Depends(get_current_user)
):
    return template_response("stock", format)


@router.post("/upload")
def upload_stock(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    df = read_upload(file)
    return import_stock(df, db, allow_cost=user.role == "admin")


@router.get("")
def list_stock(
    q: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    query = db.query(Stock)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(Stock.stock_barcode.ilike(like), Stock.stock_name.ilike(like))
        )
    rows = query.order_by(Stock.created_at.desc()).all()
    admin = user.role == "admin"
    if not admin:
        return [stock_to_dict(s) for s in rows]
    # How many purchases each item has — the UI uses it to explain whether
    # the cost price is typed by hand or averaged from purchase lots.
    counts = dict(
        db.query(Purchase.stock_barcode, func.count(Purchase.id))
        .group_by(Purchase.stock_barcode)
        .all()
    )
    return [{**stock_to_dict(s, admin=True), "purchases": int(counts.get(s.stock_barcode, 0))} for s in rows]


@router.post("", status_code=201)
def create_stock(
    payload: StockCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    admin = user.role == "admin"
    if not admin and (payload.purchase is not None or payload.cost_price is not None):
        raise HTTPException(403, "Only the admin can record cost prices and purchases.")

    barcode = payload.stock_barcode.strip()
    if db.get(Stock, barcode):
        raise HTTPException(400, f"Stock Barcode '{barcode}' already exists.")

    when = local_day_to_utc(payload.created_date, payload.tz_offset)
    item = Stock(
        stock_barcode=barcode,
        stock_name=payload.stock_name.strip(),
        qty=0 if payload.purchase else payload.qty,
        unit_price=d2(payload.unit_price),
        cost_price=d2(payload.cost_price) if payload.cost_price is not None else None,
        created_at=when,
    )
    db.add(item)
    db.flush()

    if payload.purchase:
        # Add Stock (admin) = the item + its first purchase lot, in one go.
        if payload.qty < 1:
            raise HTTPException(400, "Qty must be at least 1 when recording a purchase.")
        supplier = get_or_create_supplier(
            db, payload.purchase.supplier_id, payload.purchase.new_supplier
        )
        record_purchase(
            db,
            stock=item,
            supplier=supplier,
            qty=payload.qty,
            cost_price=payload.purchase.cost_price,
            paid_amount=payload.purchase.paid_amount,
            when=when,
            note=payload.purchase.note,
        )

    db.commit()
    db.refresh(item)
    return stock_to_dict(item, admin=admin)


@router.put("/{stock_barcode}")
def update_stock(
    stock_barcode: str,
    payload: StockUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    admin = user.role == "admin"
    item = db.get(Stock, stock_barcode)
    if not item:
        raise HTTPException(404, "Stock item not found.")
    item.stock_name = payload.stock_name.strip()
    item.qty = payload.qty
    item.unit_price = d2(payload.unit_price)
    if admin and payload.cost_price is not None:
        item.cost_price = d2(payload.cost_price)
    if payload.created_date:
        item.created_at = local_day_to_utc(payload.created_date, payload.tz_offset)
    db.commit()
    db.refresh(item)
    return stock_to_dict(item, admin=admin)


@router.delete("/{stock_barcode}")
def delete_stock(
    stock_barcode: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    item = db.get(Stock, stock_barcode)
    if not item:
        raise HTTPException(404, "Stock item not found.")
    in_bills = db.query(BillItem.id).filter(BillItem.stock_barcode == stock_barcode).first()
    if in_bills:
        raise HTTPException(
            400, "This item is used in existing bills and cannot be deleted."
        )
    if db.query(Purchase.id).filter(Purchase.stock_barcode == stock_barcode).first():
        raise HTTPException(
            400, "This item has purchases recorded and cannot be deleted. Delete those first."
        )
    try:
        db.delete(item)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            400, "This item is used in existing bills or purchases and cannot be deleted."
        )
    return {"ok": True}
