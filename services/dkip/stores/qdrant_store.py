"""Dense vector store. The collection is named by embedding signature so an
index built with one embedder is never queried with another (§7.3). Scope +
clearance are enforced as a payload pre-filter *inside* the search (§10.2)."""
from __future__ import annotations

from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

from dkip.core.config import settings

_client: QdrantClient | None = None


def client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(url=settings.QDRANT_URL, timeout=30)
    return _client


def ensure_collection() -> None:
    name = settings.qdrant_collection
    existing = {c.name for c in client().get_collections().collections}
    if name not in existing:
        client().create_collection(
            collection_name=name,
            vectors_config=qm.VectorParams(size=settings.embed_dim,
                                           distance=qm.Distance.COSINE))
        for field in ("collection_id", "document_id", "doc_type", "unit",
                      "classification", "clearance_required", "superseded",
                      "access_tags", "effective_date"):
            client().create_payload_index(name, field,
                                          field_schema=qm.PayloadSchemaType.KEYWORD
                                          if field != "clearance_required"
                                          else qm.PayloadSchemaType.INTEGER)


def upsert(points: list[dict]) -> None:
    if not points:
        return
    client().upsert(
        collection_name=settings.qdrant_collection,
        points=[qm.PointStruct(id=p["id"], vector=p["vector"], payload=p["payload"])
                for p in points])


def delete_points(point_ids: list[str]) -> None:
    """Delete specific points by ID (used during update/re-index)."""
    if not point_ids:
        return
    client().delete(collection_name=settings.qdrant_collection,
                    points_selector=qm.PointIdsSelector(
                        points=point_ids))


def _filter(scope: dict, clearance: int, access_tags: list[str] | None = None) -> qm.Filter:
    must: list = [qm.FieldCondition(key="clearance_required",
                                    range=qm.Range(lte=clearance))]
    if scope.get("collections"):
        must.append(qm.FieldCondition(key="collection_id",
                    match=qm.MatchAny(any=scope["collections"])))
    if scope.get("doc_ids"):
        must.append(qm.FieldCondition(key="document_id",
                    match=qm.MatchAny(any=scope["doc_ids"])))
    if scope.get("doc_types"):
        must.append(qm.FieldCondition(key="doc_type",
                    match=qm.MatchAny(any=scope["doc_types"])))
    if scope.get("unit"):
        must.append(qm.FieldCondition(key="unit", match=qm.MatchValue(value=scope["unit"])))
    if access_tags:
        must.append(qm.FieldCondition(key="access_tags",
                    match=qm.MatchAny(any=access_tags)))
    if scope.get("date_from"):
        must.append(qm.FieldCondition(key="effective_date",
                    range=qm.Range(gte=scope["date_from"])))
    if scope.get("date_to"):
        must.append(qm.FieldCondition(key="effective_date",
                    range=qm.Range(lte=scope["date_to"])))
    return qm.Filter(must=must)


def search(vector: list[float], scope: dict, clearance: int, limit: int,
          access_tags: list[str] | None = None) -> list[dict]:
    res = client().search(collection_name=settings.qdrant_collection,
                          query_vector=vector, limit=limit,
                          query_filter=_filter(scope, clearance, access_tags),
                          with_payload=True)
    return [{"chunk_id": str(r.id), "score": r.score, "payload": r.payload}
            for r in res]


def delete_by_document(document_id: str) -> None:
    client().delete(collection_name=settings.qdrant_collection,
                    points_selector=qm.FilterSelector(filter=qm.Filter(must=[
                        qm.FieldCondition(key="document_id",
                                          match=qm.MatchValue(value=document_id))])))


def health() -> dict:
    try:
        cols = {c.name for c in client().get_collections().collections}
        return {"reachable": True, "collection": settings.qdrant_collection,
                "present": settings.qdrant_collection in cols}
    except Exception as e:
        return {"reachable": False, "error": str(e)}
