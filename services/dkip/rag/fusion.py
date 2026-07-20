"""Reciprocal Rank Fusion (§5.3). Dense cosine and BM25 scores live on
incomparable scales; RRF uses only ranks, is parameter-light and robust."""
from __future__ import annotations


def rrf(dense: list[dict], lexical: list[dict], k: int, keep: int) -> list[dict]:
    scores: dict[str, float] = {}
    payloads: dict[str, dict] = {}
    for lst in (dense, lexical):
        for rank, hit in enumerate(lst):
            cid = hit["chunk_id"]
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + rank + 1)
            payloads.setdefault(cid, hit["payload"])
    fused = [{"chunk_id": cid, "rrf": s, "payload": payloads[cid]}
             for cid, s in scores.items()]
    fused.sort(key=lambda x: x["rrf"], reverse=True)
    return fused[:keep]
