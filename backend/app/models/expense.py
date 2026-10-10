from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class Expense(Base):
    """A day-to-day business expense (rent, bills, transport, tea, …)."""

    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    expense_date = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    category = Column(String(100), nullable=False, index=True)
    amount = Column(Numeric(14, 2), nullable=False)
    paid_to = Column(String(255), nullable=True)
    note = Column(Text, nullable=True)
    receipt_id = Column(Integer, ForeignKey("receipts.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    receipt = relationship("Receipt")

    __table_args__ = (CheckConstraint("amount >= 0", name="ck_expenses_amount_non_negative"),)
