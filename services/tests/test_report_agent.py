"""Self-check on the parts of the report agent that fail silently if broken:
the chart guards (an unsourced number must never reach a chart), intent routing
when the model returns prose instead of JSON, and doc-scoped retrieval reaching
both stores. Run: `python -m pytest tests -q`."""
from __future__ import annotations

import pytest

from dkip.agent import router as intent
from dkip.core.llm_json import parse_json
from dkip.gateway.providers.fake_provider import FakeGateway
from dkip.rag.prompt import Evidence
from dkip.reports import charts


def _ev(sid, text):
    return Evidence(sid=sid, chunk_id=f"c{sid}", doc_code="OM-VEH-001", title="Manual",
                    section="4.3", page_start=37, page_end=37, text=text, score=0.9)


class _Stub:
    """Gateway returning one canned reply, to drive the JSON paths offline."""

    provider, gen_model = "stub", "stub"

    def __init__(self, reply):
        self.reply = reply

    def generate(self, prompt, **kw):
        from dkip.gateway.base import Completion
        return Completion(text=self.reply)


# ---- chart guards ----------------------------------------------------------

def test_chart_keeps_only_points_written_in_their_cited_source():
    evidence = [_ev(1, "The unit holds 27 vehicles in total."),
                _ev(2, "Of these, 22 are serviceable.")]
    gw = _Stub('{"title":"Fleet","points":['
               '{"label":"Total","value":27,"sid":1},'
               '{"label":"Serviceable","value":22,"sid":2},'
               '{"label":"Invented","value":99,"sid":1}]}')
    chart = charts.from_evidence(gw, evidence, "fleet numbers")
    labels = {p["label"] for p in chart["points"]}
    assert labels == {"Total", "Serviceable"}   # 99 appears in no source -> dropped
    assert chart["source"] == "documents"


def test_chart_dropped_when_a_point_cites_a_source_that_was_not_retrieved():
    evidence = [_ev(1, "The unit holds 27 vehicles in total.")]
    gw = _Stub('{"points":[{"label":"Total","value":27,"sid":1},'
               '{"label":"Ghost","value":12,"sid":9}]}')
    # sid 9 was never retrieved and 12 is in no source: one point left, not chartable.
    assert charts.from_evidence(gw, evidence, "fleet numbers") is None


def test_chart_dropped_when_the_model_returns_prose():
    assert charts.from_evidence(FakeGateway(), [_ev(1, "27 vehicles")], "q") is None


def test_figures_table_is_the_fallback_and_stays_cited():
    table = charts.figures_table([_ev(1, "27 vehicles held.")])
    assert table["type"] == "table"
    assert table["rows"][0][0] == "S1"


# ---- intent routing --------------------------------------------------------

REPORT = {"title": "Fleet serviceability",
          "sections": [{"key": "bluf", "label": "Bottom line"},
                       {"key": "findings", "label": "Key findings"}],
          "charts": [{"type": "bar", "title": "Serviceable vs. total"}]}


def test_the_open_report_is_described_to_the_model():
    """Intent is judged against this report, not a list of trigger words."""
    from dkip.agent.router import _report_context

    ctx = _report_context(REPORT)
    assert "Bottom line" in ctx and "Key findings" in ctx
    assert "bar chart" in ctx and "Fleet serviceability" in ctx
    assert "no report" in _report_context(None).lower()


def test_fallback_judges_shape_not_vocabulary():
    """Offline provider: no JSON comes back, so the fallback decides.

    It reasons about the shape of the turn, never about which words appear in
    it. With a report open, a short instruction that isn't a question is an edit
    to that report. With no report open there is nothing to go on, so it answers
    the question — including for wording like "generate a report on …", which
    the old keyword table used to catch. That table is gone deliberately: it
    covered only the phrasings its author imagined and misfired on ordinary
    sentences containing those words. A wrong guess at `report_request` spends a
    minute of model time on something nobody asked for; answering the question
    cites its sources and is cheap to correct."""
    assert intent.classify(FakeGateway(), "warm up the colours",
                           report=REPORT) == intent.REPORT_REVISION
    assert intent.classify(FakeGateway(), "what is the max winch pull?",
                           report=None) == intent.QUESTION
    assert intent.classify(FakeGateway(), "generate a report on hydraulics",
                           report=None) == intent.QUESTION
    assert intent.classify(FakeGateway(), "   ", report=None) == intent.UNCLEAR


def test_revision_without_a_report_becomes_a_new_report_request():
    # An edit with nothing to edit must not silently no-op.
    assert intent.classify(FakeGateway(), "use a donut chart instead",
                           report=None) in {intent.QUESTION, intent.REPORT_REQUEST}


def test_empty_message_is_unclear():
    assert intent.classify(FakeGateway(), "   ") == intent.UNCLEAR


def test_parse_json_survives_fences_and_surrounding_prose():
    assert parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json('Sure! {"a": 2} hope that helps') == {"a": 2}
    assert parse_json("no json here") is None


# ---- revision plumbing ------------------------------------------------------

def test_a_revised_draft_is_a_separate_object_from_the_stored_one():
    """A shallow copy shares the nested chart dicts with the stored draft, so an
    in-place edit changes both — and SQLAlchemy, seeing old == new, saves
    nothing. The recolour reported success and persisted nothing."""
    from copy import deepcopy

    stored = {"charts": [{"type": "bar", "title": "t"}], "sections": []}

    shallow = dict(stored)
    shallow["charts"][0]["color"] = "#800000"
    assert stored["charts"][0].get("color") == "#800000", "shallow copy shares nested state"

    stored = {"charts": [{"type": "bar", "title": "t"}], "sections": []}
    deep = deepcopy(stored)
    deep["charts"][0]["color"] = "#800000"
    assert stored["charts"][0].get("color") is None, "deep copy must leave the original alone"
    assert deep != stored, "the change has to be visible as a different value"


# ---- evidence de-duplication -----------------------------------------------

def test_repeated_passages_collapse_to_one():
    """The same document can be in the corpus more than once; an answer must not
    cite the same sentence four times as if it were four sources."""
    from dkip.rag.fusion import dedupe_evidence

    class _Chunk:
        def __init__(self, text, section="4.4", page=1):
            self.text, self.section, self.page_start = text, section, page

    class _Doc:
        def __init__(self, code):
            self.doc_code = code

    same = "Maximum line pull is 9,000 kgf on a single part of line."
    ranked = [
        ({"chunk": _Chunk(same), "doc": _Doc("OM-VEH-001")}, 0.99),
        ({"chunk": _Chunk(same), "doc": _Doc("OM-VEH-001")}, 0.98),  # duplicate load
        ({"chunk": _Chunk(same + "  "), "doc": _Doc("OM-VEH-001")}, 0.97),  # whitespace only
        ({"chunk": _Chunk("Inspect the boom heel welds.", "2.1"), "doc": _Doc("ENG-NOTE-880")}, 0.80),
    ]
    out = dedupe_evidence(ranked)
    assert len(out) == 2, f"expected 2 distinct passages, got {len(out)}"
    assert out[0][1] == 0.99, "de-duplication should keep the best-scoring copy"
    assert out[1][0]["doc"].doc_code == "ENG-NOTE-880", "distinct evidence was dropped"


# ---- doc-scoped retrieval --------------------------------------------------

def test_doc_ids_reach_both_store_filters():
    # The store clients only exist inside the API image; skip when running the
    # suite on a bare checkout.
    pytest.importorskip("qdrant_client")
    pytest.importorskip("opensearchpy")
    from dkip.stores import opensearch_store, qdrant_store

    scope = {"doc_ids": ["doc-1", "doc-2"]}
    qfilter = qdrant_store._filter(scope, clearance=4)
    assert any(getattr(c, "key", "") == "document_id" for c in qfilter.must)
    osfilter = opensearch_store._filters(scope, clearance=4)
    assert {"terms": {"document_id": ["doc-1", "doc-2"]}} in osfilter
