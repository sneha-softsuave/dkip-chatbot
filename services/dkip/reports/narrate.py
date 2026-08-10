"""Say what happened, and ask for what's missing — in the user's own context.

Every outcome in this system used to be a fixed English sentence: "Recoloured the
chart (#7B1E1E).", "I couldn't tell which colour you meant — name one and I'll
apply it." Fixed strings make an assistant feel like a form: the same words no
matter how the person asked, and — worse — a dead end when something is
under-specified, because a sentence cannot offer choices.

So the agent reports *what happened* as data, and this module turns that into a
reply. Two shapes:

  narrate()   — an action succeeded or was declined; write one sentence about it.
  clarify()   — the action can't proceed without a detail the user didn't give;
                write the question AND the options that would answer it.

Neither is allowed to invent an outcome: both are handed exactly what the agent
did, and the options `clarify` proposes are validated by the caller against what
the report can actually accept before any of it reaches the user.
"""
from __future__ import annotations

from dkip.core.llm_json import json_call

_NARRATE = """You are the assistant in a document-analysis chat. You just acted on
the user's instruction. Tell them what happened.

They said: "{instruction}"

What actually happened: {outcome}

Reply with one short sentence, first person, past tense, no preamble and no
offer of further help. If the action was declined, say why in plain terms.
Match their register — brief if they were brief.

Return JSON: {{"text": str}}"""


_CLARIFY = """You are the assistant in a document-analysis chat. The user asked for
something you cannot do yet, because they left out a detail.

They said: "{instruction}"

What's missing: {missing}
{context}

Ask for the missing detail and offer concrete choices they can pick from.

Return JSON:
{{"text": "your question, one sentence",
  "options": [{{"label": "short human label", "value": "the exact value to apply"}}]}}

3 to 5 options, ordered best first. Make them specific to what they asked for —
if they described a mood, a brand or a feeling, propose choices that match it
rather than a generic list. `value` must be directly usable: for a colour, a hex
code like "#7B1E1E"; for a chart kind, one of bar/line/pie/table/none; for a
section, its exact key from the context above."""


def _literal(outcome: dict) -> str:
    """Degradation path when the model is unavailable — terse, factual, and
    never pretending an action succeeded when it didn't."""
    op = str(outcome.get("op") or "change").replace("_", " ")
    if outcome.get("applied"):
        return f"Done — {op}."
    reason = str(outcome.get("reason") or "").replace("_", " ").strip()
    return f"I couldn't apply that {op}" + (f": {reason}." if reason else ".")


def narrate(gateway, *, instruction: str, outcome: dict) -> str:
    """One sentence describing what just happened. Never raises."""
    try:
        summary = ", ".join(f"{k}={v}" for k, v in outcome.items() if v is not None)
        data = json_call(gateway, _NARRATE.format(instruction=instruction[:400],
                                                  outcome=summary or "nothing"),
                         max_tokens=120)
        text = (data or {}).get("text") if isinstance(data, dict) else None
        if isinstance(text, str) and text.strip():
            return text.strip()[:400]
    except Exception:
        pass
    return _literal(outcome)


def clarify(gateway, *, instruction: str, missing: str, context: str = "") -> dict:
    """A question plus the options that would answer it.

    Returns `{"text": str, "options": [{"label","value"}]}`. Options are raw —
    the caller validates each `value` against what it can actually apply, and
    drops the rest. An empty option list is a valid result: the question alone
    still moves the conversation forward, which a dead-end sentence did not.
    """
    out: dict = {"text": "", "options": []}
    try:
        data = json_call(gateway, _CLARIFY.format(instruction=instruction[:400],
                                                  missing=missing,
                                                  context=context or ""),
                         max_tokens=400)
        if isinstance(data, dict):
            text = data.get("text")
            if isinstance(text, str) and text.strip():
                out["text"] = text.strip()[:300]
            for o in (data.get("options") or [])[:5]:
                if not isinstance(o, dict):
                    continue
                label = str(o.get("label") or "").strip()
                value = str(o.get("value") or "").strip()
                if label and value:
                    out["options"].append({"label": label[:40], "value": value[:80]})
    except Exception:
        pass
    if not out["text"]:
        out["text"] = f"I need one more detail before I can do that — {missing}"
    return out
