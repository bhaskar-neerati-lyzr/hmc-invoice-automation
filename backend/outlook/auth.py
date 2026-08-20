"""Password hashing, JWT issue/verify, and the FastAPI auth dependencies
that replace the old shared-password HTTP Basic Auth.

Design mirrors invoice-process's proven pattern (HS256, Bearer token,
bcrypt) but is implemented natively here rather than importing a Node
package, since this backend is Python/FastAPI.
"""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import config

JWT_ALGORITHM = "HS256"
JWT_EXPIRES_DELTA = timedelta(days=7)

_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_token(user_id: int, email: str, role: str) -> str:
    if not config.APP_JWT_SECRET:
        raise RuntimeError("Missing required environment variable: APP_JWT_SECRET")
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + JWT_EXPIRES_DELTA,
    }
    return jwt.encode(payload, config.APP_JWT_SECRET, algorithm=JWT_ALGORITHM)


class CurrentUser:
    def __init__(self, user_id: int, email: str, role: str):
        self.user_id = user_id
        self.email = email
        self.role = role


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser:
    if not config.APP_JWT_SECRET:
        raise HTTPException(500, "Auth is not configured (set APP_JWT_SECRET)")
    if credentials is None:
        raise HTTPException(401, "Authentication required")

    try:
        payload = jwt.decode(credentials.credentials, config.APP_JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid or expired token")

    return CurrentUser(user_id=payload["user_id"], email=payload["email"], role=payload["role"])


def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if current_user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return current_user
