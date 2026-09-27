from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from backend.config import ACCESS_TOKEN_EXPIRE_MINUTES, JWT_ALGORITHM, SECRET_KEY


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Raises jose.JWTError on an invalid/expired/malformed token."""
    return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
