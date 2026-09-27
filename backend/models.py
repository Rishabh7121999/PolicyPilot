from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Nullable because this column was added via sync_columns()'s ALTER TABLE
    # path (no Alembic here) -- SQLite can't retroactively add a NOT
    # NULL/FK-enforced column to an existing table. Ownership is enforced at
    # the application layer (see backend/deps.py:get_current_user).
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    policy_type: Mapped[str] = mapped_column(String, nullable=False)
    insurer: Mapped[str | None] = mapped_column(String, nullable=True)
    product_name: Mapped[str | None] = mapped_column(String, nullable=True)
    policy_number: Mapped[str | None] = mapped_column(String, nullable=True)
    sum_insured: Mapped[str | None] = mapped_column(String, nullable=True)
    sum_insured_numeric: Mapped[float | None] = mapped_column(Float, nullable=True)
    policy_end_date: Mapped[str | None] = mapped_column(String, nullable=True)
    policy_end_date_iso: Mapped[str | None] = mapped_column(String, nullable=True)
    source_file: Mapped[str] = mapped_column(String, nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="processing")
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)
    summary_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # See Policy.user_id above for why this is nullable.
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    policy_id: Mapped[int | None] = mapped_column(
        ForeignKey("policies.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(String, nullable=False)
    sources: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Extension point for structured extras that aren't part of the displayed
    # text -- currently just `{"clarification_options": [...]}` when this
    # assistant message asked the user which policy they meant.
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
