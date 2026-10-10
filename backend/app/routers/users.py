"""Account management (admin) and profile pictures (everyone)."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..core.deps import get_current_user, require_admin
from ..core.security import hash_password, require_strong_password
from ..database import get_db
from ..models import User
from ..schemas.common import PasswordReset, UserAdminUpdate, UserCreate, UserOut
from .auth import clean_email, email_taken, user_out

router = APIRouter(prefix="/api/users", tags=["users"])


def _load(db: Session, user_id: int) -> User:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Account not found.")
    return u


def _admins_other_than(db: Session, user_id: int) -> int:
    return db.query(User.id).filter(User.role == "admin", User.id != user_id).count()


@router.get("/{user_id}/avatar")
def avatar(user_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    u = _load(db, user_id)
    if not u.avatar:
        raise HTTPException(404, "No picture set.")
    return Response(
        content=u.avatar,
        media_type=u.avatar_type or "image/jpeg",
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.get("", response_model=list[UserOut], dependencies=[Depends(require_admin)])
def list_users(db: Session = Depends(get_db)):
    return [user_out(u) for u in db.query(User).order_by(User.role, User.full_name, User.email).all()]


@router.post("", response_model=UserOut, status_code=201, dependencies=[Depends(require_admin)])
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    email = clean_email(payload.email)
    if email_taken(db, email):
        raise HTTPException(400, "An account with that email already exists.")
    require_strong_password(payload.password)
    u = User(
        email=email,
        full_name=payload.full_name.strip(),
        role=payload.role,
        hashed_password=hash_password(payload.password),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return user_out(u)


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserAdminUpdate,
    me: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    u = _load(db, user_id)
    email = clean_email(payload.email)
    if email_taken(db, email, exclude_id=user_id):
        raise HTTPException(400, "That email is already used by another account.")
    if u.role == "admin" and payload.role != "admin" and _admins_other_than(db, user_id) == 0:
        raise HTTPException(400, "There must always be at least one admin.")
    u.email = email
    u.full_name = payload.full_name.strip()
    u.role = payload.role
    db.commit()
    db.refresh(u)
    return user_out(u)


@router.post("/{user_id}/password", dependencies=[Depends(require_admin)])
def reset_password(user_id: int, payload: PasswordReset, db: Session = Depends(get_db)):
    u = _load(db, user_id)
    require_strong_password(payload.new_password)
    u.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"ok": True}


@router.delete("/{user_id}")
def delete_user(user_id: int, me: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = _load(db, user_id)
    if u.id == me.id:
        raise HTTPException(400, "You cannot delete the account you are signed in with.")
    if u.role == "admin" and _admins_other_than(db, user_id) == 0:
        raise HTTPException(400, "There must always be at least one admin.")
    db.delete(u)
    db.commit()
    return {"ok": True}
