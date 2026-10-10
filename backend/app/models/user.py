from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, LargeBinary, String

from ..database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    role = Column(String(20), nullable=False, default="user")  # 'admin' | 'user'
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    # Profile picture, stored in the DB like receipts (Render's disk is ephemeral).
    avatar = Column(LargeBinary, nullable=True)
    avatar_type = Column(String(50), nullable=True)
    avatar_updated_at = Column(DateTime, nullable=True)
