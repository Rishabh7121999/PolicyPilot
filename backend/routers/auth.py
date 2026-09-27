from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import get_current_user
from backend.models import User
from backend.schemas import AuthResponse, PasswordChange, UserCreate, UserLogin, UserOut, UserUpdate
from backend.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _is_valid_email(email: str) -> bool:
    return bool(email) and "@" in email


@router.post("/signup", response_model=AuthResponse, status_code=201)
def signup(body: UserCreate, db: Session = Depends(get_db)):
    if not _is_valid_email(body.email):
        raise HTTPException(status_code=400, detail="Invalid email address")

    existing = db.execute(select(User).where(User.email == body.email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(name=body.name, email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return AuthResponse(access_token=token, user=user)


@router.post("/login", response_model=AuthResponse)
def login(body: UserLogin, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.email == body.email)).scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = create_access_token(user.id)
    return AuthResponse(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.email is not None and body.email != current_user.email:
        if not _is_valid_email(body.email):
            raise HTTPException(status_code=400, detail="Invalid email address")

        conflict = db.execute(
            select(User).where(User.email == body.email, User.id != current_user.id)
        ).scalar_one_or_none()
        if conflict is not None:
            raise HTTPException(status_code=409, detail="Email already registered")

        current_user.email = body.email

    if body.name is not None:
        current_user.name = body.name
    if body.phone is not None:
        current_user.phone = body.phone

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password", status_code=204)
def change_password(
    body: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.password_hash = hash_password(body.new_password)
    db.commit()
