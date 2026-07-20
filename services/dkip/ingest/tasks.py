"""Per-file Celery ingestion tasks. Each file is an independent task with its
own status/error so bulk loads report per-file (§6.2, FR-5.2.5) and the
interactive plane never blocks."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from dkip.db.base import SessionLocal
from dkip.db.models import IngestionFile, IngestionJob
from dkip.ingest.pipeline import ingest_document
from dkip.stores import objects
from worker import celery_app


@celery_app.task(name="dkip.ingest.process_file")
def process_file(file_id: str, incoming_key: str, org_id: str, meta: dict) -> dict:
    db = SessionLocal()
    try:
        row = db.get(IngestionFile, file_id)
        if row is None:
            return {"status": "missing"}
        try:
            data = objects.get_by_object_key(incoming_key)
            result = ingest_document(db, org_id=org_id, filename=row.filename,
                                     data=data, meta=meta)
            row.status = result["status"]
            row.error = result["error"]
            row.chunks = result["chunks"]
            row.ocr = result["ocr"]
            row.doc_id = result["doc_id"]
        except Exception as e:  # noqa: BLE001 — record, never crash the batch
            db.rollback()
            row = db.get(IngestionFile, file_id)
            row.status = "failed"
            row.error = str(e)[:1000]
        db.commit()
        _maybe_finalize(db, row.job_id)
        return {"status": row.status}
    finally:
        db.close()


def _maybe_finalize(db, job_id: str) -> None:
    job = db.get(IngestionJob, job_id)
    if job is None:
        return
    files = db.execute(
        select(IngestionFile).where(IngestionFile.job_id == job_id)).scalars().all()
    if any(f.status == "pending" for f in files):
        return
    ok = sum(f.status == "ok" for f in files)
    failed = sum(f.status == "failed" for f in files)
    skipped = sum(f.status == "skipped" for f in files)
    job.status = "failed" if failed and not ok else "done"
    job.summary = {"total": len(files), "ok": ok, "failed": failed, "skipped": skipped}
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
