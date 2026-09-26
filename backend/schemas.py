from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class PolicyListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    policy_type: str
    insurer: str | None
    product_name: str | None
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


class ChatRequest(BaseModel):
    message: str
    history: list[str] = []
    policy_id: int | None = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[str] = []
    policy_type: str | None = None
    needs_clarification: bool = False
    clarification_question: str | None = None
    timings: dict[str, float] | None = None


class VoiceSpeakRequest(BaseModel):
    text: str
