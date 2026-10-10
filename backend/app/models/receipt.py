from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, LargeBinary, String

from ..database import Base


class Receipt(Base):
    """An uploaded receipt / bill image or PDF.

    Stored in the database rather than on disk: the backend runs on Render,
    whose filesystem is wiped on every deploy, so a file on disk would not
    survive. Images are downscaled and re-encoded on upload to keep rows small.
    """

    __tablename__ = "receipts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    kind = Column(String(20), nullable=False)  # purchase | bill | expense
    filename = Column(String(255), nullable=False)
    content_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    data = Column(LargeBinary, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
