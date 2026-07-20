"""Self-check on the highest-value RAG logic: RRF fusion, the grounding
guardrail (grounded vs abstain), and the offline provider's extractive
synthesis. Run: `python -m tests.test_rag_core` (no framework needed)."""
from __future__ import annotations

from dkip.gateway.providers.fake_provider import FakeGateway
from dkip.rag.cite import SENTINEL, finalize
from dkip.rag.fusion import rrf
from dkip.rag.prompt import Evidence, build_prompt


def _ev(sid, cid, text, score=0.9, superseded=False):
    return Evidence(sid=sid, chunk_id=cid, doc_code="OM-VEH-001", title="Manual",
                    section="4.3", page_start=37, page_end=37, text=text,
                    score=score, superseded=superseded)


def test_rrf_ranks_by_reciprocal_rank():
    dense = [{"chunk_id": "a", "payload": {}}, {"chunk_id": "b", "payload": {}}]
    lexical = [{"chunk_id": "b", "payload": {}}, {"chunk_id": "c", "payload": {}}]
    fused = rrf(dense, lexical, k=60, keep=10)
    # 'b' appears in both lists -> highest fused score, ranked first.
    assert fused[0]["chunk_id"] == "b"
    assert {f["chunk_id"] for f in fused} == {"a", "b", "c"}


def test_grounded_answer_binds_citations():
    ev = [_ev(1, "c1", "Isolate the pump if pressure does not recover.")]
    out = finalize("Isolate the pump if pressure does not recover. [S1]", ev,
                   rerank_top=0.8, threshold=0.15)
    assert out["grounded"] is True
    assert out["citations"][0]["chunk_id"] == "c1"
    assert out["confidence"] > 0


def test_abstains_on_sentinel_and_low_score_and_no_marker():
    ev = [_ev(1, "c1", "text")]
    assert finalize(SENTINEL, ev, 0.9, 0.15)["grounded"] is False          # sentinel
    assert finalize("Answer. [S1]", ev, 0.05, 0.15)["grounded"] is False   # below threshold
    assert finalize("Answer with no marker.", ev, 0.9, 0.15)["grounded"] is False  # uncited


def test_fake_provider_is_grounded_and_abstains():
    gw = FakeGateway()
    ev = [_ev(1, "c1", "The corrective action for hydraulic pressure loss is to "
                       "isolate the pump and raise a maintenance demand.")]
    prompt = build_prompt("corrective procedure for hydraulic pressure loss?", ev)
    ans = gw.generate(prompt).text
    assert "[S1]" in ans and "isolate" in ans.lower()

    empty = build_prompt("unrelated question about aircraft avionics", [])
    assert gw.generate(empty).text == SENTINEL

    # embeddings are deterministic and normalized
    v = gw.embed(["hydraulic"])[0]
    assert len(v) == 256 and abs(sum(x * x for x in v) - 1.0) < 1e-6


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all RAG-core self-checks passed")
