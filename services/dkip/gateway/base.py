"""gateway/base.py — the ONLY place the app talks to AI models (PRD §4.9).

Application code (RAG core, ingestion, summarizer, reporter) imports this
Protocol and nothing else. No module imports `openai` or `vllm` directly, so
the cloud->local swap is config-only (FR-5.1.3)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterator, Protocol, runtime_checkable


@dataclass
class Completion:
    text: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    model: str = ""
    provider: str = ""
    meta: dict = field(default_factory=dict)
    cost_usd: float = 0.0


@runtime_checkable
class ModelGateway(Protocol):
    provider: str
    gen_model: str

    def generate(self, prompt: str, *, system: str | None = None,
                 max_tokens: int = 1024, temperature: float = 0.0,
                 stop: list[str] | None = None) -> Completion: ...

    def generate_stream(self, prompt: str, *, system: str | None = None,
                        max_tokens: int = 1024, temperature: float = 0.0,
                        stop: list[str] | None = None) -> Iterator[str]: ...

    def embed(self, texts: list[str]) -> list[list[float]]: ...

    def rerank(self, query: str, passages: list[str]) -> list[float]: ...

    def health(self) -> dict: ...
