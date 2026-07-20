"""Air-gap provider: vLLM/Ollama (OpenAI-compatible) for generate, a local
BGE embed server for embed, local reranker for rerank. Same client shape as
the cloud provider pointed at internal URLs (Impl-Plan §7.2)."""
from __future__ import annotations

from typing import Iterator

import httpx
from openai import OpenAI

from dkip.core.config import settings
from dkip.gateway.base import Completion
from dkip.gateway.rerank_client import rerank_health, rerank_scores


class LocalGateway:
    provider = "local"

    def __init__(self) -> None:
        self._client = OpenAI(api_key="local", base_url=settings.LOCAL_LLM_BASE_URL)
        self.gen_model = settings.LOCAL_LLM_MODEL

    def _messages(self, prompt, system):
        msgs = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.append({"role": "user", "content": prompt})
        return msgs

    def generate(self, prompt, *, system=None, max_tokens=1024,
                 temperature=0.0, stop=None) -> Completion:
        r = self._client.chat.completions.create(
            model=self.gen_model, messages=self._messages(prompt, system),
            max_tokens=max_tokens, temperature=temperature, stop=stop)
        u = r.usage
        return Completion(text=r.choices[0].message.content or "",
                          prompt_tokens=u.prompt_tokens if u else 0,
                          completion_tokens=u.completion_tokens if u else 0,
                          model=self.gen_model, provider=self.provider)

    def generate_stream(self, prompt, *, system=None, max_tokens=1024,
                        temperature=0.0, stop=None) -> Iterator[str]:
        stream = self._client.chat.completions.create(
            model=self.gen_model, messages=self._messages(prompt, system),
            max_tokens=max_tokens, temperature=temperature, stop=stop, stream=True)
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        r = httpx.post(f"{settings.LOCAL_EMBED_BASE_URL}/embed",
                       json={"texts": texts}, timeout=60.0)
        r.raise_for_status()
        return r.json()["embeddings"]

    def rerank(self, query: str, passages: list[str]) -> list[float]:
        return rerank_scores(query, passages)

    def health(self) -> dict:
        return {"provider": self.provider, "gen_model": self.gen_model,
                "llm_base": settings.LOCAL_LLM_BASE_URL,
                "embed_base": settings.LOCAL_EMBED_BASE_URL,
                "reranker": rerank_health()}
