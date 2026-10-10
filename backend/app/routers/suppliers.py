from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..core.deps import require_admin
from ..database import get_db
from ..models import Purchase, Supplier
from ..schemas.common import SupplierIn
from ..utils.serialize import f2, iso, supplier_to_dict

router = APIRouter(
    prefix="/api/suppliers", tags=["suppliers"], dependencies=[Depends(require_admin)]
)


def get_or_create_supplier(
    db: Session, supplier_id: int | None, new_supplier: SupplierIn | None
) -> Supplier:
    """Shared by stock + purchase creation: pick an existing supplier or add one
    on the spot (the same flow as 'New Customer' on the bill form)."""
    if supplier_id:
        supplier = db.get(Supplier, supplier_id)
        if not supplier:
            raise HTTPException(404, "Selected supplier was not found.")
        return supplier
    if not new_supplier or not new_supplier.name.strip():
        raise HTTPException(400, "Choose a supplier or add a new one.")
    name = new_supplier.name.strip()
    existing = db.query(Supplier).filter(func.lower(Supplier.name) == name.lower()).first()
    if existing:
        return existing  # typed a name that already exists — reuse it quietly
    supplier = Supplier(
        name=name,
        phone=(new_supplier.phone or "").strip() or None,
        address=(new_supplier.address or "").strip() or None,
        notes=(new_supplier.notes or "").strip() or None,
    )
    db.add(supplier)
    db.flush()
    return supplier


@router.get("")
def list_suppliers(q: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Supplier)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(Supplier.name.ilike(like), Supplier.phone.ilike(like), Supplier.address.ilike(like))
        )
    suppliers = query.order_by(Supplier.name).all()

    agg = {
        sid: row
        for sid, *row in db.query(
            Purchase.supplier_id,
            func.count(Purchase.id),
            func.coalesce(func.sum(Purchase.total_cost), 0),
            func.coalesce(func.sum(Purchase.paid_amount), 0),
            func.coalesce(func.sum(Purchase.remaining_balance), 0),
            func.max(Purchase.purchase_date),
        )
        .group_by(Purchase.supplier_id)
        .all()
    }
    out = []
    for s in suppliers:
        count, bought, paid, due, last = agg.get(s.id, (0, 0, 0, 0, None))
        out.append(
            {
                **supplier_to_dict(s),
                "purchases": int(count),
                "total_bought": f2(bought),
                "total_paid": f2(paid),
                "outstanding": f2(due),
                "last_purchase": iso(last),
            }
        )
    return out


@router.post("", status_code=201)
def create_supplier(payload: SupplierIn, db: Session = Depends(get_db)):
    name = payload.name.strip()
    if db.query(Supplier).filter(func.lower(Supplier.name) == name.lower()).first():
        raise HTTPException(400, f"Supplier '{name}' already exists.")
    supplier = get_or_create_supplier(db, None, payload)
    db.commit()
    db.refresh(supplier)
    return supplier_to_dict(supplier)


@router.put("/{supplier_id}")
def update_supplier(supplier_id: int, payload: SupplierIn, db: Session = Depends(get_db)):
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(404, "Supplier not found.")
    name = payload.name.strip()
    clash = (
        db.query(Supplier)
        .filter(func.lower(Supplier.name) == name.lower(), Supplier.id != supplier_id)
        .first()
    )
    if clash:
        raise HTTPException(400, f"Another supplier is already called '{name}'.")
    supplier.name = name
    supplier.phone = (payload.phone or "").strip() or None
    supplier.address = (payload.address or "").strip() or None
    supplier.notes = (payload.notes or "").strip() or None
    db.commit()
    db.refresh(supplier)
    return supplier_to_dict(supplier)


@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(404, "Supplier not found.")
    if db.query(Purchase.id).filter(Purchase.supplier_id == supplier_id).first():
        raise HTTPException(400, "This supplier has purchases recorded and cannot be deleted.")
    db.delete(supplier)
    db.commit()
    return {"ok": True}
