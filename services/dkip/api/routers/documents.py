"""Corpus routes (§9.2): upload (async job), browse, source-resolve, delete."""
from __future__ import annotations

from fastapi import (APIRouter, Depends, File, Form, HTTPException, Request,
                     UploadFile)
from sqlalchemy import select
from sqlalchemy.orm import Session

from dkip.core import audit
from dkip.core.config import settings
from dkip.core.deps import Principal, current_user, require_role
from dkip.db.base import get_db
from dkip.db.models import (Chunk, Collection, Document, IngestionFile,
                            IngestionJob)
from dkip.ingest.pipeline import remove_document
from dkip.stores import objects

router = APIRouter(tags=["documents"])


@router.post("/documents", status_code=202)
async def upload(request: Request, files: list[UploadFile] = File(...),
                 collection: str = Form(""), doc_type: str = Form("manual"),
                 classification: str = Form("UNCLASSIFIED"),
                 unit: str = Form(""), revision: str = Form("A"),
                 user: Principal = Depends(require_role("admin")),
                 db: Session = Depends(get_db)):
    coll = db.execute(select(Collection).where(Collection.slug == collection)
                      ).scalar_one_or_none()
    job = IngestionJob(org_id=user.org_id, source="upload", trigger="manual")
    db.add(job); db.flush()

    from worker import celery_app  # local import: API image also has the task module
    filenames = []
    for f in files:
        data = await f.read()
        incoming_key = objects.put_bytes(settings.MINIO_BUCKET_RAW,
                                         f"incoming/{job.id}/{f.filename}", data,
                                         f.content_type or "application/octet-stream")
        row = IngestionFile(job_id=job.id, filename=f.filename, status="pending")
        db.add(row); db.flush()
        filenames.append(f.filename)
        meta = {"collection_id": coll.id if coll else None, "doc_type": doc_type,
                "classification": classification, "unit": unit or None,
                "revision": revision, "title": f.filename, "created_by": user.user_id,
                "doc_code": f.filename.rsplit(".", 1)[0].upper()}
        celery_app.send_task("dkip.ingest.process_file",
                             args=[row.id, incoming_key, user.org_id, meta])
    db.commit()
    audit.record(db, action="upload", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="job",
                 target_id=job.id, request_meta={"files": len(files), "filenames": filenames})
    return {"job_id": job.id, "files": len(files), "status": "accepted"}


@router.get("/documents")
def list_documents(user: Principal = Depends(current_user),
                   db: Session = Depends(get_db), collection: str | None = None,
                   doc_type: str | None = None, unit: str | None = None,
                   classification: str | None = None,
                   date_from: str | None = None, date_to: str | None = None):
    q = select(Document).where(Document.clearance_required <= user.clearance)
    if doc_type:
        q = q.where(Document.doc_type == doc_type)
    if unit:
        q = q.where(Document.unit == unit)
    if classification:
        q = q.where(Document.classification == classification)
    if date_from:
        q = q.where(Document.effective_date >= date_from)
    if date_to:
        q = q.where(Document.effective_date <= date_to)
    docs = db.execute(q.order_by(Document.created_at.desc())).scalars().all()
    if collection:
        coll = db.execute(select(Collection).where(Collection.slug == collection)
                          ).scalar_one_or_none()
        docs = [d for d in docs if coll and d.collection_id == coll.id]
    return [{"id": d.id, "doc_code": d.doc_code, "title": d.title,
             "doc_type": d.doc_type, "revision": d.revision,
             "classification": d.classification, "unit": d.unit,
             "effective_date": d.effective_date,
             "page_count": d.page_count, "status": d.status,
             "created_at": d.created_at.isoformat()} for d in docs]


@router.get("/documents/{doc_id}")
def get_document(doc_id: str, user: Principal = Depends(current_user),
                 db: Session = Depends(get_db)):
    d = db.get(Document, doc_id)
    if not d:
        raise HTTPException(404, "not found")
    if d.clearance_required > user.clearance:
        raise HTTPException(403, "above clearance")
    return {"id": d.id, "doc_code": d.doc_code, "title": d.title,
            "doc_type": d.doc_type, "revision": d.revision,
            "classification": d.classification, "unit": d.unit,
            "effective_date": d.effective_date, "page_count": d.page_count}


@router.get("/source")
def source_by_chunk(chunk_id: str, user: Principal = Depends(current_user),
                    db: Session = Depends(get_db)):
    """Resolve a citation to its passage from the chunk id alone (the citation
    payload the UI holds) — looks up the owning document, enforces clearance."""
    c = db.get(Chunk, chunk_id)
    if not c:
        raise HTTPException(404, "not found")
    return source(c.document_id, chunk_id, user, db)


@router.get("/documents/{doc_id}/source")
def source(doc_id: str, chunk_id: str, user: Principal = Depends(current_user),
           db: Session = Depends(get_db)):
    """Resolve a citation to its passage + page + bbox for the viewer (4.6)."""
    d = db.get(Document, doc_id)
    c = db.get(Chunk, chunk_id)
    if not d or not c or c.document_id != doc_id:
        raise HTTPException(404, "not found")
    if d.clearance_required > user.clearance:
        raise HTTPException(403, "above clearance")
    audit.record(db, action="document_access", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="chunk",
                 target_id=chunk_id, request_meta={"doc": d.doc_code})
    return {"doc_id": d.id, "doc_code": d.doc_code, "title": d.title,
            "revision": d.revision, "classification": d.classification,
            "section": c.section, "page_start": c.page_start,
            "page_end": c.page_end, "bbox": c.bbox, "text": c.text,
            "superseded": c.superseded, "ocr_confidence": c.ocr_confidence}


@router.get("/documents/{doc_id}/file")
def download(doc_id: str, user: Principal = Depends(current_user),
             db: Session = Depends(get_db)):
    from fastapi.responses import Response
    d = db.get(Document, doc_id)
    if not d or not d.object_key:
        raise HTTPException(404, "not found")
    if d.clearance_required > user.clearance:
        raise HTTPException(403, "above clearance")
    try:
        data = objects.get_by_object_key(d.object_key)
    except Exception:
        raise HTTPException(404, "file not available in object store")
    ct = "application/pdf" if d.object_key.lower().endswith(".pdf") else "application/octet-stream"
    return Response(content=data, media_type=ct)


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: str, user: Principal = Depends(require_role("admin")),
                    db: Session = Depends(get_db)):
    d = db.get(Document, doc_id)
    if not d:
        raise HTTPException(404, "not found")
    remove_document(db, d)
    audit.record(db, action="document_delete", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="document",
                 target_id=doc_id)
