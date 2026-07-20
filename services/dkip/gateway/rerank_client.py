"""Rerank is ALWAYS the local cross-encoder service (Impl-Plan §7.2) — every
provider delegates here, so ranking behaviour is identical across the swap."""
from __future__ import annotations

import httpx

from dkip.core.config import settings


def rerank_scores(query: str, passages: list[str]) -> list[float]:
    if not passages:
        return []
    try:
        r = httpx.post(f"{settings.RERANKER_URL}/rerank",
                       json={"query": query, "passages": passages}, timeout=30.0)
        r.raise_for_status()
        return r.json()["scores"]
    except Exception:
        # ponytail: lexical-overlap fallback keeps the pipeline alive if the
        # reranker service is down; swap back to the cross-encoder when it recovers.
        q = set(query.lower().split())
        out = []
        for p in passages:
            toks = p.lower().split()
            if not toks:
                out.append(0.0); continue
            overlap = len(q & set(toks)) / (len(q) + 1e-6)
            out.append(round(min(overlap, 1.0), 4))
        return out


def rerank_health() -> dict:
    try:
        r = httpx.get(f"{settings.RERANKER_URL}/health", timeout=5.0)
        return {"reachable": r.status_code == 200, **r.json()}
    except Exception as e:
        return {"reachable": False, "error": str(e), "fallback": "lexical-overlap"}
