from typing import Optional

from pydantic import BaseModel, Field

from .common import DateStr


class SettlementIn(BaseModel):
    """An amount received from a customer against their account as a whole."""

    amount: float = Field(gt=0)
    note: Optional[str] = None
    payment_date: DateStr = None  # manual date; empty = today
    tz_offset: int = 0
