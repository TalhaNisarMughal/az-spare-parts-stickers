from typing import Optional

from pydantic import BaseModel, Field

from .common import DateStr


class ExpenseIn(BaseModel):
    expense_date: DateStr = None
    category: str = Field(min_length=1, max_length=100)
    amount: float = Field(ge=0)
    paid_to: Optional[str] = Field(default=None, max_length=255)
    note: Optional[str] = None
    tz_offset: int = 0
