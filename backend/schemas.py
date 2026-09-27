from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class PolicyListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    policy_type: str
    insurer: str | None
    product_name: str | None
    policy_number: str | None
    sum_insured: str | None
    sum_insured_numeric: float | None
    policy_end_date: str | None
    policy_end_date_iso: str | None
    source_file: str
    status: str
    chunk_count: int
    created_at: datetime
    updated_at: datetime


class PolicyDetail(PolicyListItem):
    error_message: str | None
    summary_json: dict[str, Any] | None


class PolicyUploadResponse(BaseModel):
    id: int
    status: str


class PolicyTypeUpdate(BaseModel):
    policy_type: str


class ChatRequest(BaseModel):
    message: str
    history: list[str] = []
    policy_id: int | None = None
    voice: bool = False


class ClarificationOption(BaseModel):
    id: int
    label: str


class VoiceSpeakRequest(BaseModel):
    text: str


class ChatSessionCreate(BaseModel):
    policy_id: int | None = None


class ChatSessionPolicyUpdate(BaseModel):
    policy_id: int | None = None


class ChatSessionListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str | None
    policy_id: int | None
    created_at: datetime
    updated_at: datetime


class ChatMessageItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    text: str
    sources: list[str] | None = None
    meta: dict[str, Any] | None = None
    created_at: datetime


class ChatSessionDetail(ChatSessionListItem):
    messages: list[ChatMessageItem]


class ChatSessionMessageCreate(BaseModel):
    message: str
    voice: bool = False


class UserCreate(BaseModel):
    name: str
    email: str
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    phone: str | None
    created_at: datetime


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AuthResponse(Token):
    user: UserOut
