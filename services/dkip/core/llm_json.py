"""Ask the model for JSON and never trust that it obliged.

Every caller must pass a deterministic fallback: the offline fake provider is
extractive and returns prose, and even a real model returns malformed JSON often
enough that a feature which only works when parsing succeeds is not a feature."""
from __future__ import annotations

import json
import re
from typing import Any

_FENCE = re.compile(r"^```(?:json)?|```$", re.M)

_SYSTEM = ("Reply with a single JSON value and nothing else. No prose, no code "
           "fence, no explanation.")


def parse_json(raw: str) -> Any | None:
    """Best-effort JSON out of a model reply. None when it isn't JSON."""
    if not raw:
        return None
    text = _FENCE.sub("", raw).strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    # Model wrapped the object in prose — take the outermost {...} or [...].
    for opener, closer in (("{", "}"), ("[", "]")):
        start, end = text.find(opener), text.rfind(closer)
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except Exception:
                continue
    return None


def json_call(gateway, prompt: str, *, system: str | None = None,
              max_tokens: int = 700) -> Any | None:
    """One JSON-returning model call. None on any failure — callers fall back."""
    try:
        out = gateway.generate(prompt, system=f"{system}\n{_SYSTEM}" if system else _SYSTEM,
                               temperature=0.0, max_tokens=max_tokens)
    except Exception:
        return None
    return parse_json(out.text)
