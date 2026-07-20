"""Provider selected by config only — no application code changes (§7, §18)."""
from __future__ import annotations

import time
from functools import lru_cache

from dkip.core.config import settings
from dkip.gateway.base import ModelGateway


def _retry_call(fn, *args, max_retries=3, base_delay=1.0, **kwargs):
    """Simple exponential-backoff retry for gateway calls (§7.4)."""
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            last_exc = e
            if attempt < max_retries:
                delay = base_delay * (2 ** attempt)
                time.sleep(delay)
    raise last_exc


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
