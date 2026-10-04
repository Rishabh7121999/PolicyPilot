from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend import storage
from backend.db import get_db
from backend.deps import get_current_user
from backend.models import Policy, User
from backend.schemas import PolicyDetail, PolicyListItem, PolicyTypeUpdate, PolicyUploadResponse
from backend.services.ingestion import run_ingestion_job
from backend.rag import chunk_store

router = APIRouter(prefix="/policies", tags=["policies"])

VALID_POLICY_TYPES = {"health", "life", "motor"}


def _chunks(f, size: int = 1024 * 1024):
    with f:
        while chunk := f.read(size):
            yield chunk


@router.get("", response_model=list[PolicyListItem])
def list_policies(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.execute(
        select(Policy)
        .where(Policy.user_id == current_user.id)
        .order_by(Policy.created_at.desc())
    ).scalars().all()


@router.get("/{policy_id}", response_model=PolicyDetail)
def get_policy(
    policy_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    policy = db.get(Policy, policy_id)

    if policy is None or policy.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Policy not found")

    return policy


@router.post("/upload", response_model=PolicyUploadResponse)
def upload_policy(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    policy = Policy(
        user_id=current_user.id,
        policy_type="unknown",
        source_file=file.filename,
        file_path="",
        status="processing",
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)

    key = storage.make_key(policy.id, file.filename)
    storage.save(key, file.file)

    policy.file_path = key
    db.commit()

    background_tasks.add_task(run_ingestion_job, policy.id)

    return {"id": policy.id, "status": policy.status}


@router.get("/{policy_id}/file")
def download_policy_file(
    policy_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    policy = db.get(Policy, policy_id)

    if policy is None or policy.user_id != current_user.id or not policy.file_path:
        raise HTTPException(status_code=404, detail="Policy not found")

    if not storage.exists(policy.file_path):
        raise HTTPException(status_code=404, detail="Policy file not found")

    return StreamingResponse(
        _chunks(storage.open_file(policy.file_path)),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(policy.source_file)}"},
    )


@router.patch("/{policy_id}", response_model=PolicyDetail)
def update_policy_type(
    policy_id: int,
    body: PolicyTypeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.policy_type not in VALID_POLICY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"policy_type must be one of {sorted(VALID_POLICY_TYPES)}",
        )

    policy = db.get(Policy, policy_id)

    if policy is None or policy.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Policy not found")

    policy.policy_type = body.policy_type
    chunk_store.set_policy_type(db, policy_id, body.policy_type)
    db.commit()
    db.refresh(policy)

    return policy


@router.delete("/{policy_id}", status_code=204)
def delete_policy(
    policy_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    policy = db.get(Policy, policy_id)

    if policy is None or policy.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Policy not found")

    # The policy's chunks go with it (chunks.policy_id is ON DELETE CASCADE).
    # The row goes first: a leftover object is harmless, a row pointing at a
    # missing file is a visible bug.
    file_key = policy.file_path
    db.delete(policy)
    db.commit()

    if file_key:
        storage.delete(file_key)
