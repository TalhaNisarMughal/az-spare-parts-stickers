from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from ..database import Base


class Purchase(Base):
    """One lot of stock bought from a supplier.

    Mirrors a bill from the other side of the counter: total_cost is what the
    supplier is owed for the lot, paid_amount is what has been handed over so
    far (initial payment + later payments), remaining_balance is the rest.
    """

    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    supplier_id = Column(
        Integer, ForeignKey("suppliers.id"), nullable=False, index=True
    )
    stock_barcode = Column(
        String(100), ForeignKey("stock.stock_barcode"), nullable=False, index=True
    )
    qty = Column(Integer, nullable=False)
    cost_price = Column(Numeric(12, 2), nullable=False)  # per unit
    total_cost = Column(Numeric(14, 2), nullable=False, default=0)
    paid_amount = Column(Numeric(14, 2), nullable=False, default=0)
    remaining_balance = Column(Numeric(14, 2), nullable=False, default=0)
    status = Column(String(10), nullable=False, default="open")  # open | closed
    purchase_date = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    note = Column(Text, nullable=True)
    receipt_id = Column(Integer, ForeignKey("receipts.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_modified = Column(DateTime, default=datetime.utcnow, nullable=False)

    supplier = relationship("Supplier")
    stock = relationship("Stock")
    receipt = relationship("Receipt")
    payments = relationship(
        "PurchasePayment",
        cascade="all, delete-orphan",
        backref="purchase",
        order_by="PurchasePayment.payment_date",
    )

    __table_args__ = (
        CheckConstraint("qty > 0", name="ck_purchases_qty_positive"),
        CheckConstraint("status IN ('open','closed')", name="ck_purchases_status"),
    )


class PurchasePayment(Base):
    """Every amount ever paid to a supplier against a purchase."""

    __tablename__ = "purchase_payments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    purchase_id = Column(
        Integer, ForeignKey("purchases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount = Column(Numeric(14, 2), nullable=False)
    payment_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    note = Column(Text, nullable=True)
