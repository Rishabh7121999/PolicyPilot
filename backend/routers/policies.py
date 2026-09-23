from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.models import Policy
from backend.schemas import PolicyDetail, PolicyListItem

router = APIRouter(prefix="/policies", tags=["policies"])


@router.get("", response_model=list[PolicyListItem])
def list_policies(db: Session = Depends(get_db)):
    return db.execute(select(Policy).order_by(Policy.created_at.desc())).scalars().all()


@router.get("/{policy_id}", response_model=PolicyDetail)
def get_policy(policy_id: int, db: Session = Depends(get_db)):
    policy = db.get(Policy, policy_id)

    if policy is None:
        raise HTTPException(status_code=404, detail="Policy not found")

    return policy
