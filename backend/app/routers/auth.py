"""Sign-in and the signed-in person's own profile (name, email, password, picture)."""
import io
import re
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image, ImageOps
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.deps import get_current_user
from ..core.security import (
    create_access_token,
    hash_password,
    require_strong_password,
    verify_password,
)
from ..database import get_db
from ..models import User
from ..schemas.common import LoginIn, PasswordChange, ProfileUpdate, TokenOut, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
AVATAR_SIDE = 256


def user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        role=u.role,
        has_avatar=u.avatar is not None,
        avatar_updated_at=u.avatar_updated_at.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        if u.avatar_updated_at
        else None,
        created_at=u.created_at.strftime("%Y-%m-%dT%H:%M:%S") + "Z" if u.created_at else None,
    )


def clean_email(email: str) -> str:
    email = (email or "").strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Enter a valid email address.")
    return email


def email_taken(db: Session, email: str, exclude_id: int | None = None) -> bool:
    q = db.query(User.id).filter(func.lower(User.email) == email)
    if exclude_id:
        q = q.filter(User.id != exclude_id)
    return q.first() is not None


def make_avatar(file: UploadFile) -> bytes:
    """Square, 256px JPEG — small enough to live in the users table."""
    raw = file.file.read()
    if not raw:
        raise HTTPException(400, "The uploaded file is empty.")
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(400, "The picture is larger than 8 MB.")
    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw)))
    except Exception:
        raise HTTPException(400, "That file is not an image. Use a JPG or PNG.")
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img = ImageOps.fit(img, (AVATAR_SIDE, AVATAR_SIDE), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=85, optimize=True)
    return out.getvalue()


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.strip().lower()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return TokenOut(access_token=create_access_token(user.id, user.role), user=user_out(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.put("/me", response_model=UserOut)
def update_me(payload: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    email = clean_email(payload.email)
    if email_taken(db, email, exclude_id=user.id):
        raise HTTPException(400, "That email is already used by another account.")
    user.email = email
    user.full_name = payload.full_name.strip()
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.post("/me/password")
def change_password(payload: PasswordChange, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(400, "Your current password is not correct.")
    if payload.new_password == payload.current_password:
        raise HTTPException(400, "The new password must be different from the current one.")
    require_strong_password(payload.new_password)
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"ok": True}


@router.post("/me/avatar", response_model=UserOut)
def upload_avatar(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.avatar = make_avatar(file)
    user.avatar_type = "image/jpeg"
    user.avatar_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.delete("/me/avatar", response_model=UserOut)
def delete_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.avatar = None
    user.avatar_type = None
    user.avatar_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user_out(user)
