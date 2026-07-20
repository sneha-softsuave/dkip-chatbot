"""Re-index job for the embedding-provider swap (Impl-Plan §7.3).

A Qdrant collection is only valid for the embedding model that built it. When
the active provider's embed signature changes (e.g. cloud OpenAI-3072 -> local
BGE-1024), retrieval would be meaningless against the old collection. This job
re-embeds every chunk with the ACTIVE gateway into the new signed collection.
OpenSearch (lexical) is unaffected. generate/rerank swaps need none of this.

Usage: docker compose run --rm seed python -m dkip.scripts.reindex
"""
from __future__ import annotations

from sqlalchemy import select

from dkip.core.config import settings
from dkip.db.base import SessionLocal
from dkip.db.models import Chunk, Document
from dkip.gateway.factory import make_gateway
from dkip.stores import qdrant_store


def main(batch: int = 64) -> None:
    qdrant_store.ensure_collection()
    gateway = make_gateway()
    sig = settings.embed_signature
    print(f"[reindex] target collection {settings.qdrant_collection} (sig={sig}, "
          f"dim={settings.embed_dim}, provider={gateway.provider})")

    db = SessionLocal()
    try:
        docs = {d.id: d for d in db.execute(select(Document)).scalars().all()}
        chunks = db.execute(select(Chunk)).scalars().all()
        total = 0
        for i in range(0, len(chunks), batch):
            group = chunks[i:i + batch]
            vectors = gateway.embed([c.text for c in group])
            points = []
            for c, vec in zip(group, vectors):
                d = docs.get(c.document_id)
                points.append({"id": c.id, "vector": vec, "payload": {
                    "document_id": c.document_id,
                    "doc_code": d.doc_code if d else "",
                    "collection_id": (d.collection_id or "") if d else "",
                    "doc_type": d.doc_type if d else "",
                    "unit": (d.unit or "") if d else "",
                    "classification": d.classification if d else "UNCLASSIFIED",
                    "clearance_required": d.clearance_required if d else 1,
                    "superseded": c.superseded, "section": c.section,
                    "page_start": c.page_start}})
                c.embedding_signature = sig
            qdrant_store.upsert(points)
            total += len(points)
            print(f"[reindex] {total}/{len(chunks)} chunks re-embedded")
        db.commit()
        print(f"[reindex] done: {total} chunks -> {settings.qdrant_collection}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
