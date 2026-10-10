from typing import Literal, Optional

from pydantic import BaseModel, Field

# A manually entered date, YYYY-MM-DD in the user's local time. Every create /
# update payload carries one plus the browser's tz_offset so the backend can
# turn it into UTC (see utils/dates.py). Empty means "today, right now".
DateStr = Optional[str]


# ------------------------------------------------------------------ auth
class LoginIn(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


class UserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: str
    has_avatar: bool = False
    avatar_updated_at: Optional[str] = None
    created_at: Optional[str] = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=255)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=1)


Role = Literal["admin", "user"]


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    full_name: str = Field(min_length=1, max_length=255)
    role: Role
    password: str = Field(min_length=1)


class UserAdminUpdate(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    full_name: str = Field(min_length=1, max_length=255)
    role: Role


class PasswordReset(BaseModel):
    new_password: str = Field(min_length=1)


# ------------------------------------------------------------------ customers
class CustomerCreate(BaseModel):
    customer_code: str = Field(min_length=1, max_length=50)
    customer_name: str = Field(min_length=1, max_length=255)
    phone_number: str = Field(min_length=4, max_length=50)
    shop_name: Optional[str] = Field(default=None, max_length=255)
    address: Optional[str] = None
    created_date: DateStr = None
    tz_offset: int = 0


class CustomerUpdate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=255)
    phone_number: str = Field(min_length=4, max_length=50)
    shop_name: Optional[str] = Field(default=None, max_length=255)
    address: Optional[str] = None
    created_date: DateStr = None
    tz_offset: int = 0


# ------------------------------------------------------------------ suppliers
class SupplierIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    address: Optional[str] = None
    notes: Optional[str] = None


# ------------------------------------------------------------------ stock
class PurchaseDetails(BaseModel):
    """The buying side of a stock entry (admin only).

    Either pick an existing supplier (supplier_id) or create one on the spot
    (new_supplier) — same pattern as "New Customer" on the bill form.
    """

    supplier_id: Optional[int] = None
    new_supplier: Optional[SupplierIn] = None
    cost_price: float = Field(ge=0)
    paid_amount: float = Field(default=0, ge=0)
    note: Optional[str] = None


class StockCreate(BaseModel):
    stock_barcode: str = Field(min_length=1, max_length=100)
    stock_name: str = Field(min_length=1, max_length=255)
    qty: int = Field(ge=0)
    unit_price: float = Field(ge=0)
    cost_price: Optional[float] = Field(default=None, ge=0)  # admin only; ignored if purchase given
    purchase: Optional[PurchaseDetails] = None               # admin only; records the first lot
    created_date: DateStr = None
    tz_offset: int = 0


class StockUpdate(BaseModel):
    stock_name: str = Field(min_length=1, max_length=255)
    qty: int = Field(ge=0)
    unit_price: float = Field(ge=0)
    cost_price: Optional[float] = Field(default=None, ge=0)  # admin only
    created_date: DateStr = None
    tz_offset: int = 0
