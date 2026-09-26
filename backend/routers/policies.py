import shutil
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import UPLOADS_DIR
from backend.db import get_db
from backend.models import Policy
from backend.schemas import PolicyDetail, PolicyListItem, PolicyUploadResponse
from backend.services.ingestion import run_ingestion_job
from backend.rag.retriever import invalidate_bm25_cache
from backend.rag.vectorstore import get_vectordb

router = APIRouter(prefix="/policies", tags=["policies"])

VALID_POLICY_TYPES = {"health", "life"}


@router.get("", response_model=list[PolicyListItem])
def list_policies(db: Session = Depends(get_db)):
    return db.execute(select(Policy).order_by(Policy.created_at.desc())).scalars().all()


@router.get("/{policy_id}", response_model=PolicyDetail)
def get_policy(policy_id: int, db: Session = Depends(get_db)):
    policy = db.get(Policy, policy_id)

    if policy is None:
        raise HTTPException(status_code=404, detail="Policy not found")

    return policy


@router.post("/upload", response_model=PolicyUploadResponse)
def upload_policy(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    policy_type: str = Form(...),
    db: Session = Depends(get_db),
):
    if policy_type not in VALID_POLICY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"policy_type must be one of {sorted(VALID_POLICY_TYPES)}",
        )

    policy = Policy(
        policy_type=policy_type,
        source_file=file.filename,
        file_path="",
        status="processing",
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)

    policy_dir = UPLOADS_DIR / str(policy.id)
    policy_dir.mkdir(parents=True, exist_ok=True)
    file_path = policy_dir / file.filename

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    policy.file_path = str(file_path)
    db.commit()

    background_tasks.add_task(run_ingestion_job, policy.id)

    return {"id": policy.id, "status": policy.status}


@router.delete("/{policy_id}", status_code=204)
def delete_policy(policy_id: int, db: Session = Depends(get_db)):
    policy = db.get(Policy, policy_id)

    if policy is None:
        raise HTTPException(status_code=404, detail="Policy not found")

    get_vectordb().delete(where={"policy_id": str(policy_id)})
    invalidate_bm25_cache()

    if policy.file_path:
        shutil.rmtree(Path(policy.file_path).parent, ignore_errors=True)

    db.delete(policy)
    db.commit()
