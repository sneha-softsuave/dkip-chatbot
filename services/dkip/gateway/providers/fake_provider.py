"""Deterministic, offline provider — used by tests and as an automatic
fallback when no OPENAI_API_KEY is set, so the whole pipeline (retrieve ->
abstain -> cite) is demonstrable with zero external dependencies or cost.

- embed(): stable hashed bag-of-words vectors (no network, deterministic).
- generate(): extractive synthesis from the [S1..Sk] passages already in the
  prompt, emitting real [Sn] citation markers and the INSUFFICIENT_SOURCES
  sentinel when the prompt carries no evidence — mirroring a real LLM's
  grounded/abstain contract (§5.5).
- rerank(): delegates to the local reranker service (lexical fallback)."""
from __future__ import annotations

import hashlib
import math
import re
from typing import Iterator

from dkip.gateway.base import Completion
from dkip.gateway.rerank_client import rerank_health, rerank_scores

_DIM = 256
_SENT = re.compile(r"(?<=[.!?])\s+")
_SRC_BLOCK = re.compile(r"\[S(\d+)\][^\n]*\n(.*?)(?=\n\[S\d+\]|\Z)", re.S)


def _hash_vec(text: str) -> list[float]:
    vec = [0.0] * _DIM
    for tok in re.findall(r"[a-z0-9]+", text.lower()):
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        vec[h % _DIM] += 1.0
        vec[(h // _DIM) % _DIM] += 0.5  # a second, decorrelated bucket
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


class FakeGateway:
    provider = "fake"
    gen_model = "fake-extractive-v1"

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [_hash_vec(t) for t in texts]

    def _synthesize(self, prompt: str) -> str:
        blocks = _SRC_BLOCK.findall(prompt)
        if not blocks:
            return "INSUFFICIENT_SOURCES"
        # Recover the question (last "Question:" line the RAG core writes).
        m = re.search(r"Question:\s*(.+)", prompt)
        q_terms = set(re.findall(r"[a-z0-9]+", (m.group(1) if m else "").lower()))
        scored = []
        for sid, body in blocks:
            for sent in _SENT.split(body.strip()):
                terms = set(re.findall(r"[a-z0-9]+", sent.lower()))
                if not terms:
                    continue
                overlap = len(q_terms & terms)
                scored.append((overlap, int(sid), sent.strip()))
        scored.sort(key=lambda x: (-x[0], x[1]))
        picked = [s for s in scored if s[0] > 0][:3]
        if not picked:
            return "INSUFFICIENT_SOURCES"
        return " ".join(f"{sent} [S{sid}]" for _, sid, sent in picked)

    def generate(self, prompt, *, system=None, max_tokens=1024,
                 temperature=0.0, stop=None) -> Completion:
        return Completion(text=self._synthesize(prompt), model=self.gen_model,
                          provider=self.provider)

    def generate_stream(self, prompt, *, system=None, max_tokens=1024,
                        temperature=0.0, stop=None) -> Iterator[str]:
        for tok in re.findall(r"\S+\s*", self._synthesize(prompt)):
            yield tok

    def rerank(self, query: str, passages: list[str]) -> list[float]:
        return rerank_scores(query, passages)

    def health(self) -> dict:
        return {"provider": self.provider, "gen_model": self.gen_model,
                "offline": True, "reranker": rerank_health()}
