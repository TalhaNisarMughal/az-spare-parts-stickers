from typing import Optional

from pydantic import BaseModel, Field

from .common import DateStr, SupplierIn


class PurchaseCreate(BaseModel):
    """Restock an existing item from a supplier."""

    stock_barcode: str = Field(min_length=1)
    supplier_id: Optional[int] = None
    new_supplier: Optional[SupplierIn] = None
    qty: int = Field(ge=1)
    cost_price: float = Field(ge=0)
    paid_amount: float = Field(default=0, ge=0)
    purchase_date: DateStr = None
    note: Optional[str] = None
    tz_offset: int = 0


class PurchaseUpdate(BaseModel):
    supplier_id: int
    qty: int = Field(ge=1)
    cost_price: float = Field(ge=0)
    purchase_date: DateStr = None
    note: Optional[str] = None
    tz_offset: int = 0


class PurchasePaymentIn(BaseModel):
    amount: float = Field(gt=0)
    payment_date: DateStr = None
    note: Optional[str] = None
    tz_offset: int = 0
