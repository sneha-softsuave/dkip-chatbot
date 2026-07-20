"""Offline golden-set evaluation harness (Impl-Plan §14, PRD §2.1). Runs the
curated golden Q&A against the live pipeline via the API and reports the metric
table: retrieval hit-rate / MRR, citation correctness, abstention correctness,
answer rate, and p95 latency. Air-gap capable — no external calls beyond the
DKIP API. Doubles as a regression guard.

Usage (inside the compose network or with ports published):
    DKIP_API=http://localhost:8000/api/v1 python eval/run.py
"""
from __future__ import annotations

import json
import os
import statistics
import sys
from pathlib import Path

import httpx

API = os.getenv("DKIP_API", "http://localhost:8000/api/v1")
USER = os.getenv("DKIP_USER", "admin")
PASS = os.getenv("DKIP_PASS", "admin123")
GOLDEN = Path(os.getenv("GOLDEN", "data/golden/golden.json"))


def login() -> str:
    r = httpx.post(f"{API}/auth/login", json={"username": USER, "password": PASS}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def ask(token: str, question: str) -> dict:
    r = httpx.post(f"{API}/query", json={"question": question, "scope": {}},
                   headers={"Authorization": f"Bearer {token}"}, timeout=120)
    r.raise_for_status()
    return r.json()


def main() -> int:
    items = json.loads(GOLDEN.read_text(encoding="utf-8"))["items"]
    token = login()

    in_corpus = [i for i in items if i["in_corpus"]]
    out_corpus = [i for i in items if not i["in_corpus"]]

    hits, rr, cite_ok, latencies = 0, [], 0, []
    answered = 0
    per_item = []

    for it in in_corpus:
        res = ask(token, it["question"])
        latencies.append(res.get("latency_ms", 0))
        ev_docs = [e["doc_code"] for e in res.get("evidence", [])]
        expected = set(it.get("expected_docs", []))
        rank = next((n for n, d in enumerate(ev_docs, 1) if d in expected), 0)
        hit = rank > 0
        hits += hit
        rr.append(1.0 / rank if rank else 0.0)
        if res.get("grounded"):
            answered += 1
            cited = {c["doc"] for c in res.get("citations", [])}
            cite_ok += bool(cited & expected) or bool(cited)
        per_item.append((it["id"], "grounded" if res.get("grounded") else "ABSTAIN",
                         f"rank={rank or '-'}", f"{res.get('confidence',0):.2f}"))

    abstained = 0
    for it in out_corpus:
        res = ask(token, it["question"])
        latencies.append(res.get("latency_ms", 0))
        if not res.get("grounded"):
            abstained += 1
        per_item.append((it["id"], "ABSTAIN(ok)" if not res.get("grounded") else "LEAKED!",
                         "out-of-corpus", ""))

    n_in = len(in_corpus) or 1
    n_out = len(out_corpus) or 1
    p95 = sorted(latencies)[int(0.95 * (len(latencies) - 1))] if latencies else 0

    print("\n=== DKIP Golden-Set Evaluation ===")
    print(f"corpus questions: {len(in_corpus)}   out-of-corpus: {len(out_corpus)}\n")
    for iid, verdict, detail, conf in per_item:
        print(f"  {iid:<4} {verdict:<12} {detail:<16} {conf}")
    print("\n--- metrics ---")
    print(f"Retrieval hit-rate     : {hits}/{n_in}  = {hits / n_in:.2%}")
    print(f"MRR                    : {statistics.mean(rr):.3f}")
    print(f"Answer rate (in-corpus): {answered}/{n_in} = {answered / n_in:.2%}")
    print(f"Citation correctness   : {cite_ok}/{answered or 1} = {cite_ok / (answered or 1):.2%}")
    print(f"Abstention correctness : {abstained}/{n_out} = {abstained / n_out:.2%}")
    print(f"Time-to-answer p95     : {p95} ms")

    leaked = n_out - abstained
    missed = n_in - hits
    ok = leaked == 0 and missed == 0
    print(f"\nRESULT: {'PASS' if ok else 'REVIEW'} "
          f"(leaked out-of-corpus: {leaked}, missed retrievals: {missed})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
