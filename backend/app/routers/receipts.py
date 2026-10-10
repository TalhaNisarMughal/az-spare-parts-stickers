from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.deps import get_current_user
from ..database import get_db
from ..models import Receipt, User
from ..utils.receipts import receipt_response

router = APIRouter(prefix="/api/receipts", tags=["receipts"])


@router.get("/{receipt_id}")
def get_receipt(
    receipt_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream a stored receipt. Sales receipts are visible to everyone who is
    signed in; purchase and expense receipts are admin-only like their records."""
    r = db.get(Receipt, receipt_id)
    if not r:
        raise HTTPException(404, "Receipt not found.")
    if r.kind != "bill" and user.role != "admin":
        raise HTTPException(403, "Only the admin can view this receipt.")
    return receipt_response(r)
