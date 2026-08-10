"""What did the user just ask for?

The model decides, and it decides *with the conversation's report in front of it*
— its title, its sections, its current chart. "Make the bars maroon", "swap that
for a donut", "trim the opener" and "brighten it up" are all edits to that
report, and no list of trigger words drawn up in advance covers the ways people
actually say things.

There are no keyword rules. When the model returns nothing parseable, the
fallback answers the question rather than guessing from vocabulary — see
`_fallback`."""
from __future__ import annotations


QUESTION = "question"
REPORT_REQUEST = "report_request"
REPORT_REVISION = "report_revision"
UNCLEAR = "unclear"
_INTENTS = {QUESTION, REPORT_REQUEST, REPORT_REVISION, UNCLEAR}

_PROMPT = """Decide what the user wants from their latest message.

{context}

Recent conversation:
{history}

Latest message: "{message}"

Return JSON: {{"intent": "question" | "report_request" | "report_revision" | "unclear"}}

- report_revision — they want the report described above changed in any way: its
  wording, its length, its sections, its title, or how its chart looks (type,
  colour, styling). Anything that only makes sense as a change to that report.
- report_request — they want a NEW report, brief or write-up produced.
- question — they want something answered from the documents.
- unclear — a greeting, or too vague to act on.

Judge intent, not vocabulary: the user may phrase any of these however they like."""

_NO_REPORT = ("There is no report in this conversation yet, so nothing can be "
              "revised.")


def _report_context(report: dict | None) -> str:
    if not report:
        return _NO_REPORT
    sections = ", ".join(s.get("label", "") for s in report.get("sections") or [])
    charts = ", ".join(f"a {c.get('type')} chart titled '{c.get('title')}'"
                       for c in report.get("charts") or []) or "no chart"
    return (f"A report is open in this conversation:\n"
            f"  title: {report.get('title', '')}\n"
            f"  sections: {sections or '(none)'}\n"
            f"  chart: {charts}")


def _fallback(message: str, has_report: bool) -> str:
    """Used only when the model returns nothing parseable (offline provider,
    malformed JSON).

    The word lists are gone — matching "report"/"generate"/"draft" only ever
    covered the phrasings whoever wrote the list imagined, and misfired on
    ordinary sentences that happened to contain them.

    What remains is about shape, not vocabulary: with a report already open, a
    short instruction that isn't a question is far more likely an edit to it
    than a new enquiry about the corpus. Everything else answers the question,
    which is the safe default — it reads the corpus and cites its sources, where
    a wrong guess at `report_request` burns a minute of model time producing
    something nobody asked for."""
    text = message.strip()
    if not text:
        return UNCLEAR
    if has_report and not text.endswith("?") and len(text.split()) <= 20:
        return REPORT_REVISION
    return QUESTION


def classify(gateway, message: str, *, history: list[tuple[str, str]] | None = None,
             report: dict | None = None, has_report: bool = False) -> str:
    """Intent for this turn. Never raises."""
    has_report = has_report or report is not None
    if not message.strip():
        return UNCLEAR

    from dkip.core.llm_json import json_call  # local: keeps import cost off the hot path

    lines = "\n".join(f"{role}: {content[:200]}" for role, content in (history or [])[-4:])
    data = json_call(gateway, _PROMPT.format(context=_report_context(report),
                                             history=lines or "(none)",
                                             message=message[:500]), max_tokens=60)
    intent = (data or {}).get("intent") if isinstance(data, dict) else None
    if intent in _INTENTS:
        # A revision needs something to revise; without one, treat it as a new report.
        if intent == REPORT_REVISION and not has_report:
            return REPORT_REQUEST
        return intent
    return _fallback(message, has_report)
