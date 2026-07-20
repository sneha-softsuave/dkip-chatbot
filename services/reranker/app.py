"""Local cross-encoder reranker (§5.4). Called by the gateway's rerank() in
every provider so ranking is identical across the cloud<->local swap. Falls
back to lexical overlap if the model can't load, so the stack still comes up."""
from __future__ import annotations

import os

from fastapi import FastAPI
from pydantic import BaseModel

MODEL_NAME = os.getenv("RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
app = FastAPI(title="DKIP Reranker", version="1.0.0")

_model = None
_mode = "lexical"


def _load():
    global _model, _mode
    if _model is not None:
        return
    try:
        from sentence_transformers import CrossEncoder
        _model = CrossEncoder(MODEL_NAME)
        _mode = "cross-encoder"
    except Exception as e:  # noqa: BLE001
        # ponytail: lexical fallback keeps the pipeline scoring even with no
        # model/torch present; swap back once the model is provisioned.
        print(f"[reranker] model load failed ({e}); using lexical fallback")
        _model = "lexical"
        _mode = "lexical"


class RerankIn(BaseModel):
    query: str
    passages: list[str]


def _sigmoid(x: float) -> float:
    import math
    return 1.0 / (1.0 + math.exp(-x))


@app.on_event("startup")
def _startup():
    _load()


@app.get("/health")
def health():
    return {"reachable": True, "mode": _mode, "model": MODEL_NAME}


@app.post("/rerank")
def rerank(body: RerankIn):
    if not body.passages:
        return {"scores": []}
    _load()
    if _mode == "cross-encoder":
        raw = _model.predict([(body.query, p) for p in body.passages])
        # normalize logits to 0..1 so the abstain threshold is comparable
        scores = [round(float(_sigmoid(float(s))), 4) for s in raw]
        return {"scores": scores}
    q = set(body.query.lower().split())
    out = []
    for p in body.passages:
        toks = set(p.lower().split())
        out.append(round(len(q & toks) / (len(q) + 1e-6), 4) if toks else 0.0)
    return {"scores": out}
