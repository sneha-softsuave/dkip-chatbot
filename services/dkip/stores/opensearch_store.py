"""Lexical BM25 store. Exact-term recall for part numbers / nomenclatures that
dense search misses (§5.3). Same scope+clearance filter as Qdrant (§10.2)."""
from __future__ import annotations

from opensearchpy import OpenSearch

from dkip.core.config import settings

_client: OpenSearch | None = None

_MAPPING = {
    "settings": {"index": {"number_of_shards": 1, "number_of_replicas": 0}},
    "mappings": {"properties": {
        "text": {"type": "text", "analyzer": "english",
                 "fields": {"exact": {"type": "keyword"}}},
        "document_id": {"type": "keyword"},
        "doc_code": {"type": "keyword"},
        "section": {"type": "keyword"},
        "collection_id": {"type": "keyword"},
        "doc_type": {"type": "keyword"},
        "unit": {"type": "keyword"},
        "classification": {"type": "keyword"},
        "clearance_required": {"type": "integer"},
        "superseded": {"type": "boolean"},
        "page_start": {"type": "integer"},
    }},
}


def client() -> OpenSearch:
    global _client
    if _client is None:
        _client = OpenSearch(hosts=[settings.OPENSEARCH_URL], timeout=30,
                             http_compress=True)
    return _client


def ensure_index() -> None:
    if not client().indices.exists(settings.OPENSEARCH_INDEX):
        client().indices.create(settings.OPENSEARCH_INDEX, body=_MAPPING)


def index_chunks(chunks: list[dict]) -> None:
    if not chunks:
        return
    body = []
    for c in chunks:
        body.append({"index": {"_index": settings.OPENSEARCH_INDEX, "_id": c["id"]}})
        body.append({k: v for k, v in c.items() if k != "id"})
    client().bulk(body=body, refresh=True)


def _filters(scope: dict, clearance: int) -> list[dict]:
    f: list[dict] = [{"range": {"clearance_required": {"lte": clearance}}}]
    if scope.get("collections"):
        f.append({"terms": {"collection_id": scope["collections"]}})
    if scope.get("doc_types"):
        f.append({"terms": {"doc_type": scope["doc_types"]}})
    if scope.get("unit"):
        f.append({"term": {"unit": scope["unit"]}})
    return f


def search(query: str, scope: dict, clearance: int, limit: int) -> list[dict]:
    body = {"size": limit, "query": {"bool": {
        "must": [{"multi_match": {"query": query, "fields": ["text^1", "text.exact^3"],
                                  "type": "best_fields"}}],
        "filter": _filters(scope, clearance)}}}
    res = client().search(index=settings.OPENSEARCH_INDEX, body=body)
    return [{"chunk_id": h["_id"], "score": h["_score"], "payload": h["_source"]}
            for h in res["hits"]["hits"]]


def delete_by_document(document_id: str) -> None:
    client().delete_by_query(index=settings.OPENSEARCH_INDEX, refresh=True,
                             body={"query": {"term": {"document_id": document_id}}})


def health() -> dict:
    try:
        ok = client().indices.exists(settings.OPENSEARCH_INDEX)
        return {"reachable": True, "index": settings.OPENSEARCH_INDEX, "present": ok}
    except Exception as e:
        return {"reachable": False, "error": str(e)}
