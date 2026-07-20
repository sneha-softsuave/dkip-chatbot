"""Provider selected by config only — no application code changes (§7, §18)."""
from __future__ import annotations

from functools import lru_cache

from dkip.core.config import settings
from dkip.gateway.base import ModelGateway


@lru_cache
def make_gateway() -> ModelGateway:
    provider = settings.MODEL_PROVIDER
    # Auto-degrade cloud -> fake when no key is configured, so the demo never
    # hard-fails on a missing secret. Logged at /health so it is never silent.
    if provider == "cloud" and not settings.OPENAI_API_KEY:
        provider = "fake"

    if provider == "cloud":
        from dkip.gateway.providers.openai_provider import OpenAIGateway
        return OpenAIGateway()
    if provider == "local":
        from dkip.gateway.providers.local_provider import LocalGateway
        return LocalGateway()
    from dkip.gateway.providers.fake_provider import FakeGateway
    return FakeGateway()


def reset_gateway() -> None:
    make_gateway.cache_clear()
