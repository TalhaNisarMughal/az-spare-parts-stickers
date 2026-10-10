import re
from datetime import datetime, timedelta

import bcrypt
import jwt
from fastapi import HTTPException

from ..config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


# Complexity rules: every account password must clear all of these.
PASSWORD_RULES = [
    (lambda p: len(p) >= 8, "at least 8 characters"),
    (lambda p: re.search(r"[A-Z]", p), "an uppercase letter"),
    (lambda p: re.search(r"[a-z]", p), "a lowercase letter"),
    (lambda p: re.search(r"[0-9]", p), "a number"),
    (lambda p: re.search(r"[^A-Za-z0-9]", p), "a special character (e.g. ! @ # $ %)"),
]


def password_problems(password: str) -> list[str]:
    return [label for check, label in PASSWORD_RULES if not check(password)]


def require_strong_password(password: str) -> None:
    missing = password_problems(password)
    if missing:
        raise HTTPException(400, "Password must have " + ", ".join(missing) + ".")


def create_access_token(user_id: int, role: str) -> str:
    payload = {
        "sub": str(user_id),  # the id, so changing an email never logs anyone out
        "role": role,
        "exp": datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
