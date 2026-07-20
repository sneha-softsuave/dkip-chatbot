"""MinIO object store: raw uploads, OCR renders, exports (§8.4)."""
from __future__ import annotations

import io

from minio import Minio

from dkip.core.config import settings

_client: Minio | None = None


def client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(settings.MINIO_ENDPOINT, access_key=settings.MINIO_ACCESS_KEY,
                        secret_key=settings.MINIO_SECRET_KEY, secure=settings.MINIO_SECURE)
    return _client


def ensure_buckets() -> None:
    for b in (settings.MINIO_BUCKET_RAW, settings.MINIO_BUCKET_OCR,
              settings.MINIO_BUCKET_EXPORTS):
        if not client().bucket_exists(b):
            client().make_bucket(b)


def put_bytes(bucket: str, key: str, data: bytes, content_type: str) -> str:
    client().put_object(bucket, key, io.BytesIO(data), length=len(data),
                        content_type=content_type)
    return f"{bucket}/{key}"


def delete_by_object_key(object_key: str) -> None:
    """Remove an object from MinIO by its full object key (bucket/key)."""
    bucket, key = object_key.split("/", 1)
    client().remove_object(bucket, key)


def get_bytes(bucket: str, key: str) -> bytes:
    resp = client().get_object(bucket, key)
    try:
        return resp.read()
    finally:
        resp.close(); resp.release_conn()


def get_by_object_key(object_key: str) -> bytes:
    bucket, key = object_key.split("/", 1)
    return get_bytes(bucket, key)


def health() -> dict:
    try:
        client().bucket_exists(settings.MINIO_BUCKET_RAW)
        return {"reachable": True}
    except Exception as e:
        return {"reachable": False, "error": str(e)}
