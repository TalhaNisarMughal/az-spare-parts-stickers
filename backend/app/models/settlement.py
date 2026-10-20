from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class Settlement(Base):
    """One amount received from a customer against their whole account.

    Instead of opening bills one by one, the shop records what the customer
    handed over and the system spreads it across that customer's open bills,
    oldest first. The per-bill slices are ordinary BillPayment rows (so every
    ledger and bill slip stays correct); they point back here so the receiving
    can be shown as one line and undone as one unit.
    """

    __tablename__ = "customer_settlements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_code = Column(
        String(50), ForeignKey("customers.customer_code"), nullable=False, index=True
    )
    amount = Column(Numeric(14, 2), nullable=False)
    payment_date = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    note = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)  # name of the user who recorded it
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    customer = relationship("Customer")
    payments = relationship(
        "BillPayment", backref="settlement", order_by="BillPayment.id"
    )

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_customer_settlements_amount_positive"),
    )


class SupplierSettlement(Base):
    """One amount paid to a supplier against the whole account.

    The mirror of Settlement: instead of paying purchases one by one, the
    shop records what was handed to the supplier and the system spreads it
    across that supplier's unpaid purchases, oldest first. The per-purchase
    slices are ordinary PurchasePayment rows (so the supplier ledger and the
    dashboard stay exact); they point back here so the payment can be shown
    as one line and undone as one unit.
    """

    __tablename__ = "supplier_settlements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False, index=True)
    amount = Column(Numeric(14, 2), nullable=False)
    payment_date = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    note = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    supplier = relationship("Supplier")
    payments = relationship(
        "PurchasePayment", backref="settlement", order_by="PurchasePayment.id"
    )

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_supplier_settlements_amount_positive"),
    )
