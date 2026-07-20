"""Ingestion orchestration (§6.2): parse -> (OCR) -> chunk -> embed -> index
into Qdrant + OpenSearch, with metadata/anchors to Postgres and raw bytes to
MinIO. Content-hash dedupe avoids re-embedding unchanged files (§6.6)."""
from __future__ import annotations

import hashlib

from sqlalchemy import select
from sqlalchemy.orm import Session

from dkip.core.config import settings
from dkip.db.models import Chunk as ChunkRow
from dkip.db.models import Document
from dkip.gateway.factory import make_gateway
from dkip.ingest.chunk import chunk_parsed
from dkip.ingest.parse import parse
from dkip.stores import objects, opensearch_store, qdrant_store

_CLASS_LEVEL = {"UNCLASSIFIED": 1, "RESTRICTED": 2, "CONFIDENTIAL": 3, "SECRET": 4}


def _content_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower()
    return {"pdf": "application/pdf",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            }.get(ext, "text/plain")


def ingest_document(db: Session, *, org_id: str, filename: str, data: bytes,
                    meta: dict) -> dict:
    """Returns a per-file ledger record (§6.2, FR-5.2.5). Raises on hard failure."""
    content_hash = hashlib.sha256(data).hexdigest()
    existing = db.execute(
        select(Document).where(Document.content_hash == content_hash)
    ).scalar_one_or_none()
    if existing:
        return {"status": "skipped", "error": "duplicate content", "chunks": 0,
                "ocr": False, "doc_id": existing.id}

    parsed = parse(filename, data)
    chunks = chunk_parsed(parsed)
    if not chunks:
        raise ValueError("no extractable text after parse/OCR")

    classification = meta.get("classification", "UNCLASSIFIED")
    clearance = meta.get("clearance_required", _CLASS_LEVEL.get(classification, 1))
    object_key = objects.put_bytes(settings.MINIO_BUCKET_RAW,
                                   f"{content_hash}/{filename}", data,
                                   _content_type(filename))

    doc = Document(
        org_id=org_id, collection_id=meta.get("collection_id"),
        doc_code=meta.get("doc_code", ""), title=meta.get("title", filename),
        doc_type=meta.get("doc_type", "manual"), source=meta.get("source", "upload"),
        revision=meta.get("revision", "A"), effective_date=meta.get("effective_date"),
        unit=meta.get("unit"), classification=classification,
        clearance_required=clearance, access_tags=meta.get("access_tags", []),
        content_hash=content_hash, object_key=object_key,
        page_count=parsed.page_count, status="indexing",
        created_by=meta.get("created_by"))
    db.add(doc)
    db.flush()

    gateway = make_gateway()
    vectors = gateway.embed([c.text for c in chunks])

    q_points, os_docs = [], []
    for c, vec in zip(chunks, vectors):
        row = ChunkRow(document_id=doc.id, ordinal=c.ordinal, text=c.text,
                       section=c.section, page_start=c.page_start,
                       page_end=c.page_end, char_start=c.char_start,
                       char_end=c.char_end, bbox=c.bbox, revision=doc.revision,
                       superseded=False, ocr_confidence=c.ocr_confidence,
                       embedding_signature=settings.embed_signature)
        db.add(row)
        db.flush()
        payload = {"document_id": doc.id, "doc_code": doc.doc_code,
                   "collection_id": doc.collection_id or "", "doc_type": doc.doc_type,
                   "unit": doc.unit or "", "classification": classification,
                   "clearance_required": clearance, "superseded": False,
                   "access_tags": doc.access_tags or [],
                   "effective_date": str(doc.effective_date) if doc.effective_date else "",
                   "section": c.section, "page_start": c.page_start}
        q_points.append({"id": row.id, "vector": vec, "payload": payload})
        os_docs.append({"id": row.id, "text": c.text, **payload})

    qdrant_store.upsert(q_points)
    opensearch_store.index_chunks(os_docs)
    doc.status = "indexed"
    db.commit()
    return {"status": "ok", "error": None, "chunks": len(chunks),
            "ocr": parsed.ocr, "doc_id": doc.id}


def remove_document(db: Session, doc: Document) -> None:
    qdrant_store.delete_by_document(doc.id)
    opensearch_store.delete_by_document(doc.id)
    # Clean up the raw file from MinIO (§6.6)
    if doc.object_key:
        try:
            objects.delete_by_object_key(doc.object_key)
        except Exception:
            pass
    db.delete(doc)
    db.commit()


def update_document(db: Session, *, doc: Document, filename: str, data: bytes,
                    meta: dict) -> dict:
    """Revision-aware re-index (§6.6): mark old chunks superseded, re-chunk,
    embed, index new revision, upsert by chunk_id."""
    content_hash = hashlib.sha256(data).hexdigest()
    if doc.content_hash == content_hash:
        return {"status": "skipped", "error": "identical content", "chunks": 0,
                "ocr": False, "doc_id": doc.id}

    parsed = parse(filename, data)
    chunks = chunk_parsed(parsed)
    if not chunks:
        raise ValueError("no extractable text after parse/OCR")

    classification = meta.get("classification", doc.classification)
    clearance = meta.get("clearance_required", doc.clearance_required)
    new_revision = meta.get("revision", doc.revision)

    # Mark existing chunks superseded and remove from stores
    old_chunks = db.execute(
        select(ChunkRow).where(ChunkRow.document_id == doc.id)
    ).scalars().all()
    old_ids = [c.id for c in old_chunks]
    for c in old_chunks:
        c.superseded = True
    if old_ids:
        qdrant_store.delete_points(old_ids)
        opensearch_store.delete_by_ids(old_ids)

    # Store new raw object
    object_key = objects.put_bytes(settings.MINIO_BUCKET_RAW,
                                   f"{content_hash}/{filename}", data,
                                   _content_type(filename))

    # Update document metadata
    doc.doc_code = meta.get("doc_code", doc.doc_code)
    doc.title = meta.get("title", doc.title)
    doc.revision = new_revision
    doc.effective_date = meta.get("effective_date", doc.effective_date)
    doc.classification = classification
    doc.clearance_required = clearance
    doc.content_hash = content_hash
    doc.object_key = object_key
    doc.page_count = parsed.page_count
    doc.status = "indexing"
    db.flush()

    # Embed and index new chunks
    gateway = make_gateway()
    vectors = gateway.embed([c.text for c in chunks])

    q_points, os_docs = [], []
    for c, vec in zip(chunks, vectors):
        row = ChunkRow(document_id=doc.id, ordinal=c.ordinal, text=c.text,
                       section=c.section, page_start=c.page_start,
                       page_end=c.page_end, char_start=c.char_start,
                       char_end=c.char_end, bbox=c.bbox, revision=new_revision,
                       superseded=False, ocr_confidence=c.ocr_confidence,
                       embedding_signature=settings.embed_signature)
        db.add(row)
        db.flush()
        payload = {"document_id": doc.id, "doc_code": doc.doc_code,
                   "collection_id": doc.collection_id or "", "doc_type": doc.doc_type,
                   "unit": doc.unit or "", "classification": classification,
                   "clearance_required": clearance, "superseded": False,
                   "effective_date": str(doc.effective_date) if doc.effective_date else "",
                   "section": c.section, "page_start": c.page_start}
        q_points.append({"id": row.id, "vector": vec, "payload": payload})
        os_docs.append({"id": row.id, "text": c.text, **payload})

    qdrant_store.upsert(q_points)
    opensearch_store.index_chunks(os_docs)
    doc.status = "indexed"
    db.commit()
    return {"status": "ok", "error": None, "chunks": len(chunks),
            "ocr": parsed.ocr, "doc_id": doc.id,
            "previous_chunks_superseded": len(old_ids)}
