from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from ..database import Base


class Supplier(Base):
    """Someone the shop buys stock from — a person or a company."""

    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, unique=True)
    phone = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
