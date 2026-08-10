"""Reciprocal Rank Fusion (§5.3). Dense cosine and BM25 scores live on
incomparable scales; RRF uses only ranks, is parameter-light and robust.

Also holds de-duplication, the other rank-level concern: pure ranking logic with
no store or database dependency, so it stays unit-testable on its own."""
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


def dedupe_evidence(ranked: list[tuple[dict, float]]) -> list[tuple[dict, float]]:
    """Collapse repeats of the same passage, keeping the best-scoring copy.

    The same document can legitimately be in the corpus more than once (a
    re-issue, the same manual filed under two collections, a load job run
    twice). Without this, one answer cites "6 sources" that are the same
    sentence four times — which reads as corroboration when it is nothing of
    the kind, and crowds genuinely different evidence out of the top-k."""
    seen: set[tuple] = set()
    out: list[tuple[dict, float]] = []
    for cand, score in ranked:
        chunk, doc = cand["chunk"], cand["doc"]
        key = (getattr(doc, "doc_code", ""), chunk.section, chunk.page_start,
               " ".join(chunk.text.split())[:200].lower())
        if key in seen:
            continue
        seen.add(key)
        out.append((cand, score))
    return out
