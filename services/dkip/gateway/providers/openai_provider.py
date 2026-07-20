"""Demo provider: OpenAI for generate + embed. rerank is delegated local."""
from __future__ import annotations

from typing import Iterator

from openai import OpenAI

from dkip.core.config import settings
from dkip.gateway.base import Completion
from dkip.gateway.rerank_client import rerank_health, rerank_scores


class OpenAIGateway:
    provider = "cloud"

    def __init__(self) -> None:
        self._client = OpenAI(api_key=settings.OPENAI_API_KEY,
                              base_url=settings.OPENAI_BASE_URL)
        self.gen_model = settings.OPENAI_GEN_MODEL
        self._embed_model = settings.OPENAI_EMBED_MODEL

    def _messages(self, prompt: str, system: str | None):
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
        r = self._client.embeddings.create(model=self._embed_model, input=texts)
        return [d.embedding for d in r.data]

    def rerank(self, query: str, passages: list[str]) -> list[float]:
        return rerank_scores(query, passages)

    def health(self) -> dict:
        ok = bool(settings.OPENAI_API_KEY)
        return {"provider": self.provider, "gen_model": self.gen_model,
                "embed_model": self._embed_model, "key_present": ok,
                "reranker": rerank_health()}
