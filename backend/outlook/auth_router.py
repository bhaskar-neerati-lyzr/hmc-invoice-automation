"""Auth, account, and user-management endpoints - replaces the old single
shared-password Basic Auth entirely. Behavior mirrors invoice-process's
proven design (see ocr-app/misc/merge-plan-invoice-process-ux.txt), but
responses use plain FastAPI conventions (raw JSON, HTTPException) rather
than that app's {success,data} wrapper, to stay consistent with this
backend's own existing endpoints (invoices_router.py already returns raw
JSON).
"""

import re
import secrets
import string

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from . import config, database, models
from .auth import CurrentUser, create_token, get_current_user, hash_password, require_admin, verify_password

router = APIRouter(tags=["auth"])

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

_LOWER = "abcdefghjkmnpqrstuvwxyz"
_UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ"
_DIGITS = "23456789"
_SYMBOLS = "!@#$%^&*-_+="
_ALL = _LOWER + _UPPER + _DIGITS + _SYMBOLS


def _generate_password(length: int = 12) -> str:
    """Cryptographically random invite password - mirrors
    invoice-process's lib/generatePassword.ts: guarantees at least one
    lower/upper/digit/symbol char, rest random, then shuffled."""
    required = [secrets.choice(_LOWER), secrets.choice(_UPPER), secrets.choice(_DIGITS), secrets.choice(_SYMBOLS)]
    rest = [secrets.choice(_ALL) for _ in range(max(length - len(required), 0))]
    chars = required + rest
    for i in range(len(chars) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        chars[i], chars[j] = chars[j], chars[i]
    return "".join(chars)


class LoginBody(BaseModel):
    email: str
    password: str


@router.post("/api/auth/login")
def login(body: LoginBody):
    with database.get_session() as session:
        user = session.query(models.User).filter_by(email=body.email.strip().lower()).one_or_none()
        if user is None or not verify_password(body.password, user.password_hash):
            raise HTTPException(401, "Incorrect email or password")

        token = create_token(user.id, user.email, user.role)
        return {
            "token": token,
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "role": user.role,
                "must_reset_password": user.must_reset_password,
            },
        }


@router.get("/api/auth/me")
def me(current_user: CurrentUser = Depends(get_current_user)):
    with database.get_session() as session:
        user = session.query(models.User).filter_by(id=current_user.user_id).one_or_none()
        if user is None:
            raise HTTPException(404, "Account not found")
        return {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "must_reset_password": user.must_reset_password,
        }


@router.post("/api/seed", status_code=200)
def seed():
    """One-time idempotent bootstrap of the first admin account, from
    SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD. Public (no auth) because no
    account exists yet on a brand-new deployment - called automatically
    from the frontend's login page on mount. Safe to call repeatedly:
    no-ops once that email already exists, and never echoes the
    password back."""
    if not config.SEED_ADMIN_EMAIL or not config.SEED_ADMIN_PASSWORD:
        raise HTTPException(500, "Admin seed credentials are not configured")

    with database.get_session() as session:
        existing = session.query(models.User).filter_by(email=config.SEED_ADMIN_EMAIL.strip().lower()).one_or_none()
        if existing is not None:
            return {"seeded": False}

        session.add(
            models.User(
                email=config.SEED_ADMIN_EMAIL.strip().lower(),
                password_hash=hash_password(config.SEED_ADMIN_PASSWORD),
                name="Admin",
                role="admin",
                must_reset_password=False,
            )
        )
    return {"seeded": True}


@router.get("/api/account")
def get_account(current_user: CurrentUser = Depends(get_current_user)):
    with database.get_session() as session:
        user = session.query(models.User).filter_by(id=current_user.user_id).one_or_none()
        if user is None:
            raise HTTPException(404, "Account not found")
        return {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "must_reset_password": user.must_reset_password,
        }


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


@router.post("/api/account/password")
def change_password(body: ChangePasswordBody, current_user: CurrentUser = Depends(get_current_user)):
    if len(body.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")

    with database.get_session() as session:
        user = session.query(models.User).filter_by(id=current_user.user_id).one_or_none()
        if user is None:
            raise HTTPException(404, "Account not found")
        if not verify_password(body.current_password, user.password_hash):
            raise HTTPException(401, "Current password is incorrect")

        user.password_hash = hash_password(body.new_password)
        user.must_reset_password = False

    return {"message": "Password updated"}


@router.get("/api/users")
def list_users(_: CurrentUser = Depends(require_admin)):
    with database.get_session() as session:
        users = session.query(models.User).order_by(models.User.created_at).all()
        return [
            {
                "id": u.id,
                "email": u.email,
                "name": u.name,
                "role": u.role,
                "must_reset_password": u.must_reset_password,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ]


class CreateUserBody(BaseModel):
    email: str
    name: str | None = None
    role: str


@router.post("/api/users", status_code=201)
def create_user(body: CreateUserBody, _: CurrentUser = Depends(require_admin)):
    if body.role not in ("admin", "viewer"):
        raise HTTPException(400, "role must be 'admin' or 'viewer'")
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Invalid email format")

    with database.get_session() as session:
        existing = session.query(models.User).filter_by(email=email).one_or_none()
        if existing is not None:
            raise HTTPException(409, "An account with this email already exists")

        generated_password = _generate_password()
        user = models.User(
            email=email,
            password_hash=hash_password(generated_password),
            name=body.name,
            role=body.role,
            must_reset_password=True,
        )
        session.add(user)
        session.flush()
        return {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "created_at": user.created_at.isoformat(),
            "must_reset_password": True,
            "generated_password": generated_password,
        }


@router.delete("/api/users/{user_id}")
def revoke_user(user_id: int, current_user: CurrentUser = Depends(require_admin)):
    if user_id == current_user.user_id:
        raise HTTPException(400, "You cannot revoke your own account")

    with database.get_session() as session:
        user = session.query(models.User).filter_by(id=user_id).one_or_none()
        if user is None:
            raise HTTPException(404, "User not found")
        if not user.must_reset_password:
            raise HTTPException(409, "Cannot revoke an account that already accepted its invitation")
        session.delete(user)

    return {"id": user_id}


@router.post("/api/users/{user_id}/reset-invite")
def reset_invite(user_id: int, _: CurrentUser = Depends(require_admin)):
    with database.get_session() as session:
        user = session.query(models.User).filter_by(id=user_id).one_or_none()
        if user is None:
            raise HTTPException(404, "User not found")
        if not user.must_reset_password:
            raise HTTPException(409, "This user already accepted their invitation")

        generated_password = _generate_password()
        user.password_hash = hash_password(generated_password)
        return {"id": user.id, "email": user.email, "generated_password": generated_password}
