import subprocess
import sys

from backend.config import (
    BASE_DIR,
    CLOUD_RUN_JOB_NAME,
    CLOUD_RUN_REGION,
    GCP_PROJECT,
    INGESTION_MODE,
)


def run_ingestion_job(policy_id: int) -> None:
    """Background task for an uploaded policy: start the ingestion job
    (`backend.rag.ingest_job --policy-id N`, which does everything including
    the DB writes) and return. The job marks the row ready/failed itself."""
    if INGESTION_MODE == "cloudrun":
        _start_cloud_run_job(policy_id)
    elif INGESTION_MODE == "local":
        # A subprocess, not an in-process call: Docling's native stack crashes
        # flakily when one process converts more than one PDF. If the worker
        # dies without updating the row, the startup reconciler in main.py
        # eventually marks it failed.
        subprocess.run(
            [sys.executable, "-m", "backend.rag.ingest_job", "--policy-id", str(policy_id)],
            cwd=BASE_DIR,
        )
    else:
        raise ValueError(f"Unknown INGESTION_MODE={INGESTION_MODE!r}")


def _start_cloud_run_job(policy_id: int) -> None:
    # Imported here so a laptop in local mode doesn't need the client at import.
    from google.cloud import run_v2

    job = f"projects/{GCP_PROJECT}/locations/{CLOUD_RUN_REGION}/jobs/{CLOUD_RUN_JOB_NAME}"
    request = run_v2.RunJobRequest(
        name=job,
        overrides=run_v2.RunJobRequest.Overrides(
            container_overrides=[
                run_v2.RunJobRequest.Overrides.ContainerOverride(
                    args=["--policy-id", str(policy_id)]
                )
            ]
        ),
    )
    # run_job returns a long-running operation; we don't wait on it -- the job
    # runs for minutes and reports through the Policy row.
    run_v2.JobsClient().run_job(request=request)
