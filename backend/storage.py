"""Storage for uploaded policy PDFs, behind one small interface so the rest of
the app doesn't care where the bytes live.

A policy's file is addressed by a *key* (`policies/<policy_id>/<filename>`),
which is what `Policy.file_path` holds. Two backends, picked by
`STORAGE_BACKEND`:

- local: files under UPLOADS_DIR (laptop development). An absolute key is used
  as-is, so rows from before this module existed keep working.
- gcs: objects in the GCS_BUCKET bucket. Credentials come from Application
  Default Credentials: `gcloud auth application-default login` on a laptop,
  the attached service account on Cloud Run -- no keys in code or env.
"""

import shutil
import tempfile
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import BinaryIO, Iterator

from backend.config import GCS_BUCKET, STORAGE_BACKEND, UPLOADS_DIR


def make_key(policy_id: int, filename: str) -> str:
    # Path().name drops any directory parts a client put in the filename.
    return f"policies/{policy_id}/{Path(filename).name}"


class LocalStorage:
    def _path(self, key: str) -> Path:
        path = Path(key)
        return path if path.is_absolute() else UPLOADS_DIR / key

    def save(self, key: str, fileobj: BinaryIO) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            shutil.copyfileobj(fileobj, f)

    def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def open(self, key: str) -> BinaryIO:
        return open(self._path(key), "rb")

    def delete(self, key: str) -> None:
        shutil.rmtree(self._path(key).parent, ignore_errors=True)

    @contextmanager
    def local_copy(self, key: str) -> Iterator[Path]:
        yield self._path(key)  # already on disk: no copy needed


class GCSStorage:
    def __init__(self, bucket_name: str):
        # Imported here so a local-only install never needs the GCS client.
        from google.cloud import storage

        self._bucket = storage.Client().bucket(bucket_name)

    def save(self, key: str, fileobj: BinaryIO) -> None:
        self._bucket.blob(key).upload_from_file(fileobj, content_type="application/pdf")

    def exists(self, key: str) -> bool:
        return self._bucket.blob(key).exists()

    def open(self, key: str) -> BinaryIO:
        return self._bucket.blob(key).open("rb")  # streams in chunks, not all in memory

    def delete(self, key: str) -> None:
        blob = self._bucket.blob(key)
        if blob.exists():
            blob.delete()

    @contextmanager
    def local_copy(self, key: str) -> Iterator[Path]:
        """Download to a temp dir, keeping the original filename (the chunk
        metadata's `source_file` comes from it), and clean up afterwards."""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / Path(key).name
            self._bucket.blob(key).download_to_filename(path)
            yield path


@lru_cache(maxsize=1)
def _backend() -> LocalStorage | GCSStorage:
    if STORAGE_BACKEND == "gcs":
        if not GCS_BUCKET:
            raise RuntimeError("GCS_BUCKET must be set when STORAGE_BACKEND=gcs")
        return GCSStorage(GCS_BUCKET)
    if STORAGE_BACKEND == "local":
        return LocalStorage()
    raise RuntimeError(f"Unknown STORAGE_BACKEND={STORAGE_BACKEND!r}")


def save(key: str, fileobj: BinaryIO) -> None:
    _backend().save(key, fileobj)


def exists(key: str) -> bool:
    return _backend().exists(key)


def open_file(key: str) -> BinaryIO:
    return _backend().open(key)


def delete(key: str) -> None:
    _backend().delete(key)


def local_copy(key: str):
    """Context manager yielding a local Path to the file, for code (Docling)
    that needs a real path. Temporary for GCS, the file itself for local."""
    return _backend().local_copy(key)
