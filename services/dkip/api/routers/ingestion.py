"""Ingestion job status + per-file load report (§9.2, FR-5.2.5)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from dkip.core.deps import Principal, require_role
from dkip.db.base import get_db
from dkip.db.models import Collection, IngestionFile, IngestionJob

router = APIRouter(tags=["ingestion"])


@router.get("/ingestion/jobs")
def jobs(user: Principal = Depends(require_role("admin")),
         db: Session = Depends(get_db)):
    rows = db.execute(select(IngestionJob).order_by(IngestionJob.started_at.desc())
                      .limit(50)).scalars().all()
    return [{"id": j.id, "source": j.source, "status": j.status,
             "summary": j.summary, "started_at": j.started_at.isoformat(),
             "finished_at": j.finished_at.isoformat() if j.finished_at else None}
            for j in rows]


@router.get("/ingestion/jobs/{job_id}")
def job_files(job_id: str, user: Principal = Depends(require_role("admin")),
              db: Session = Depends(get_db)):
    job = db.get(IngestionJob, job_id)
    if not job:
        raise HTTPException(404, "not found")
    files = db.execute(select(IngestionFile).where(IngestionFile.job_id == job_id)
                       ).scalars().all()
    return {"id": job.id, "status": job.status, "summary": job.summary,
            "files": [{"filename": f.filename, "status": f.status,
                       "error": f.error, "chunks": f.chunks, "ocr": f.ocr,
                       "doc_id": f.doc_id} for f in files]}


@router.get("/collections")
def collections(user: Principal = Depends(require_role("admin", "user")),
                db: Session = Depends(get_db)):
    rows = db.execute(select(Collection)).scalars().all()
    return [{"slug": c.slug, "name": c.name, "description": c.description}
            for c in rows]
