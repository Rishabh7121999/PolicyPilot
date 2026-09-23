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
