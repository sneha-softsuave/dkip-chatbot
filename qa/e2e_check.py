"""End-to-end regression for the DKIP API — the automated half of docs/TESTING.md.

Run it against a live stack:

    python qa/e2e_check.py                        # localhost:8002
    python qa/e2e_check.py --api http://host/api/v1
    python qa/e2e_check.py --group answers        # one group only
    python qa/e2e_check.py --skip-ingest          # when the worker isn't running

Every check is one assertion with a name; failures are collected, not fatal, so a
single broken feature doesn't hide the state of everything else. Test data is
created with a QA- prefix and removed in cleanup, which runs even after failures.
Seeded corpus documents are never deleted.

No third-party dependencies: stdlib only, so it runs anywhere the API is reachable.
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import time
import urllib.error
import urllib.request
import uuid
import zipfile
from pathlib import Path

API = "http://localhost:8002/api/v1"
GOLDEN = Path(__file__).resolve().parent.parent / "data" / "golden" / "golden.json"

ACCOUNTS = {"admin": "admin123", "analyst": "analyst123", "operator": "operator123"}

# Facts each golden answer must actually contain — the point of the exercise is
# that the bot answers *correctly*, not merely that it answers.
FACTS = {
    "g1": ["isolate", "pump"],
    "g2": ["9,000", "kgf"],
    "g3": ["HF-2205"],
    "g4": ["20"],
    "g5": ["90"],
    "g6": ["3"],
    "g7": ["dye", "3 mm"],
    "g8": ["HF-2205"],
}

QA_DOC_TEXT = (
    "QA TEST DOCUMENT — FICTIONAL\n\n"
    "1 Purpose\n"
    "This document exists only to verify ingestion and retrieval.\n\n"
    "2 Marker Facts\n"
    "The QA calibration torque for the zephyr coupling is 47 N.m.\n"
    "The zephyr coupling part number is ZC-9911.\n"
    "Replace the zephyr coupling every 750 operating hours.\n"
)

results: list[tuple[str, str, str]] = []   # (group, name, detail) — detail "" = pass
failures = 0


# ---------------------------------------------------------------- http helpers

def request(path, *, token=None, body=None, method=None, form=None, raw=False,
            timeout=300):
    url = API + path
    headers = {}
    data = None
    if form is not None:
        boundary = "----qa" + uuid.uuid4().hex
        buf = io.BytesIO()
        for key, value in form.get("fields", {}).items():
            buf.write(f"--{boundary}\r\n".encode())
            buf.write(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
            buf.write(f"{value}\r\n".encode())
        for filename, content in form.get("files", []):
            buf.write(f"--{boundary}\r\n".encode())
            buf.write(f'Content-Disposition: form-data; name="files"; '
                      f'filename="{filename}"\r\n'.encode())
            buf.write(b"Content-Type: application/octet-stream\r\n\r\n")
            buf.write(content)
            buf.write(b"\r\n")
        buf.write(f"--{boundary}--\r\n".encode())
        data = buf.getvalue()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=headers,
                                 method=method or ("POST" if data else "GET"))
    # Retry connection-level failures only. An HTTPError is a real result and is
    # never retried — otherwise a check for "this must 403" could pass by luck.
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                payload = r.read()
            break
        except (ConnectionError, TimeoutError) as e:
            if attempt == 2:
                raise
            print(f"          (retrying {path} after {type(e).__name__})")
            time.sleep(2)
    return payload if raw else (json.loads(payload) if payload else None)


def status_of(path, **kw):
    """HTTP status for a call expected to fail."""
    try:
        request(path, **kw)
        return 200
    except urllib.error.HTTPError as e:
        return e.code


def turn(token, session_id, message):
    """One /chat/turn, returning the `done` payload."""
    for attempt in range(3):
        data = json.dumps({"session_id": session_id, "message": message}).encode()
        req = urllib.request.Request(API + "/chat/turn", data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Authorization", "Bearer " + token)
        done, buf = None, ""
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                for chunk in r:
                    buf += chunk.decode("utf-8", "replace")
                    while "\n\n" in buf:
                        frame, buf = buf.split("\n\n", 1)
                        if frame.startswith("event: done"):
                            done = json.loads(frame.split("data: ", 1)[1])
            return done or {}
        except (ConnectionError, TimeoutError) as e:
            if attempt == 2:
                raise
            print(f"          (retrying turn after {type(e).__name__})")
            time.sleep(2)
    return {}


def login(username):
    return request("/auth/login", body={"username": username,
                                        "password": ACCOUNTS[username]})["access_token"]


def reports(token):
    """The report archive as a plain list — /reports pages the same way
    /documents does. This one matters for more than convenience: the check that
    a restricted report is *absent* from a standard account's list is only
    meaningful if it reads the whole archive, not the first page of it."""
    return request("/reports?limit=200", token=token)["items"]


def documents(token):
    """The corpus as a plain list. GET /documents pages — it returns
    {items, total, limit, offset}, and its default page is 25 of 30-odd
    documents — so every caller that treated it as a list either crashed or
    silently searched a fraction of the corpus."""
    return request("/documents?limit=200", token=token)["items"]


#: Every conversation this run opens, with the token that owns it, so cleanup can
#: delete them. Untracked sessions used to survive the run and pile up in the
#: sidebar's Recent list under whichever demo account the check happened to use.
_sessions: list[tuple[str, str]] = []


def new_session(token, title="QA"):
    sid = request("/chat/sessions", token=token, body={"title": title})["id"]
    _sessions.append((token, sid))
    return sid


# ------------------------------------------------------------------- reporting

def check(group, name, fn):
    global failures
    try:
        fn()
        results.append((group, name, ""))
        print(f"  PASS  {name}")
    except AssertionError as e:
        failures += 1
        results.append((group, name, str(e) or "assertion failed"))
        print(f"  FAIL  {name}\n          {e}")
    except Exception as e:  # noqa: BLE001 — an error is a failed check, not a crash
        failures += 1
        results.append((group, name, f"{type(e).__name__}: {e}"))
        print(f"  FAIL  {name}\n          {type(e).__name__}: {e}")


def cited_docs(payload):
    return {c["doc"] for c in payload.get("citations") or []}


# ----------------------------------------------------------------------- groups

def group_auth(ctx):
    def three_accounts():
        for user in ACCOUNTS:
            assert login(user), f"{user} could not sign in"

    def wrong_password():
        code = status_of("/auth/login", body={"username": "admin", "password": "nope"})
        assert code == 401, f"expected 401 for a bad password, got {code}"

    def no_token():
        code = status_of("/documents")
        assert code == 401, f"expected 401 without a token, got {code}"

    def analyst_cannot_upload():
        code = status_of("/documents", token=ctx["analyst"],
                         form={"fields": {"collection": "veh-recovery"},
                               "files": [("QA-DENIED.txt", b"nope")]})
        assert code == 403, f"analyst upload should be 403, got {code}"

    def analyst_cannot_list_users():
        code = status_of("/users", token=ctx["analyst"])
        assert code == 403, f"analyst /users should be 403, got {code}"

    def analyst_cannot_see_jobs():
        code = status_of("/ingestion/jobs", token=ctx["analyst"])
        assert code == 403, f"analyst /ingestion/jobs should be 403, got {code}"

    check("auth", "all three accounts sign in", three_accounts)
    check("auth", "wrong password is rejected", wrong_password)
    check("auth", "no token is rejected", no_token)
    check("auth", "analyst cannot upload documents", analyst_cannot_upload)
    check("auth", "analyst cannot list people", analyst_cannot_list_users)
    check("auth", "analyst cannot read ingestion jobs", analyst_cannot_see_jobs)


def group_answers(ctx):
    items = json.loads(GOLDEN.read_text(encoding="utf-8"))["items"]
    token = ctx["admin"]

    for item in items:
        if not item["in_corpus"]:
            continue
        gid, question = item["id"], item["question"]

        def answered(gid=gid, question=question, item=item):
            out = turn(token, new_session(token), question)
            assert out.get("kind") == "answer", f"{gid}: got a {out.get('kind')} card"
            assert out.get("grounded"), f"{gid}: abstained on an in-corpus question"
            text = (out.get("answer") or "").lower()
            for fact in FACTS.get(gid, []):
                assert fact.lower() in text, f"{gid}: answer is missing {fact!r} — {text[:160]}"
            expected = set(item.get("expected_docs") or [])
            if expected:
                got = cited_docs(out)
                assert got & expected, f"{gid}: cited {got or '{}'}, expected one of {expected}"

        check("answers", f"{gid}: {question[:58]}", answered)

    for item in items:
        if item["in_corpus"]:
            continue

        def abstains(question=item["question"], gid=item["id"]):
            out = turn(token, new_session(token), question)
            assert not out.get("grounded"), \
                f"{gid}: answered an out-of-corpus question — {(out.get('answer') or '')[:160]}"
            assert out.get("suggestions"), f"{gid}: abstention offered no next steps"

        check("answers", f"{item['id']}: abstains — {item['question'][:44]}", abstains)

    def supersession():
        out = turn(token, new_session(token),
                   "What is the corrective procedure for hydraulic pressure loss?")
        text = (out.get("answer") or "").lower()
        assert "isolate" in text, "did not give the current (Revision B) guidance"
        assert "resume operation" not in text, \
            "answered from the superseded Revision A text"

    def citation_resolves():
        out = turn(token, new_session(token), "What is the maximum winch line pull on the ARV-5?")
        cite = (out.get("citations") or [None])[0]
        assert cite, "answer carried no citation"
        src = request(f"/source?chunk_id={cite['chunk_id']}", token=token)
        assert src["doc_code"] == cite["doc"], "citation resolves to a different document"
        assert src["text"].strip(), "cited passage is empty"

    check("answers", "current revision wins over the superseded one", supersession)
    check("answers", "a citation resolves to its source passage", citation_resolves)


def group_clearance(ctx):
    question = "What action is required on ARV-5 boom heel welds after 5,000 cycles?"

    def operator_blocked():
        out = turn(ctx["operator"], new_session(ctx["operator"]), question)
        assert "ENG-NOTE-880" not in cited_docs(out), \
            "operator (clearance 1) was cited a RESTRICTED document"
        text = (out.get("answer") or "").lower()
        assert "dye" not in text and "3 mm" not in text, \
            "RESTRICTED content leaked to an operator"

    def analyst_allowed():
        out = turn(ctx["analyst"], new_session(ctx["analyst"]), question)
        assert out.get("grounded"), "analyst (clearance 2) was denied a document they may read"
        assert "ENG-NOTE-880" in cited_docs(out), "analyst answer did not cite the advisory"

    check("clearance", "operator cannot reach RESTRICTED content", operator_blocked)
    check("clearance", "analyst can reach RESTRICTED content", analyst_allowed)


def group_report_access(ctx):
    """A report is a copy of its sources, so it must be gated like them: a
    standard account must not be able to read one built from a document it
    cannot open."""
    docs = documents(ctx["admin"])
    restricted = next((d for d in docs if d["classification"] not in ("UNCLASSIFIED", "")), None)
    if restricted is None:
        results.append(("report-access", "skipped — no restricted document in the corpus", ""))
        print("  SKIP  no restricted document in the corpus")
        return

    state = {}

    def full_account_builds_one():
        report = request("/reports/generate", token=ctx["analyst"], body={
            "question": f"what {restricted['doc_code']} says",
            "title": "QA restricted report",
            "sections": [{"key": "s", "label": "Summary", "prompt": "the key points"}],
            "scope": {"doc_ids": [restricted["id"]]}, "depth": "brief", "chart": "none"})
        state["report"] = report
        ctx["cleanup_reports"].append(report["id"])
        cited = {c["doc"] for s in report["sections"] for c in s["citations"]}
        assert cited, "full-access account produced a report with no citations"

    def standard_account_cannot_list_it():
        listed = {r["id"] for r in reports(ctx["operator"])}
        assert state["report"]["id"] not in listed, \
            "a restricted report is listed for a standard account"

    def standard_account_cannot_open_it():
        code = status_of(f"/reports/{state['report']['id']}", token=ctx["operator"])
        assert code == 404, f"standard account opened a restricted report (HTTP {code})"

    def standard_account_cannot_export_it():
        code = status_of(f"/reports/{state['report']['id']}/export?format=pdf",
                         token=ctx["operator"], body={"chart_images": []})
        assert code == 404, f"standard account exported a restricted report (HTTP {code})"

    def owner_can_still_open_it():
        out = request(f"/reports/{state['report']['id']}", token=ctx["analyst"])
        assert out["sections"], "the author can no longer read their own report"

    def another_persons_chat_is_private():
        session = new_session(ctx["analyst"], title="QA private")
        code = status_of(f"/chat/sessions/{session}", token=ctx["operator"])
        assert code == 404, f"another person's conversation was readable (HTTP {code})"

    check("report-access", "full account can build a restricted report", full_account_builds_one)
    check("report-access", "standard account cannot list it", standard_account_cannot_list_it)
    check("report-access", "standard account cannot open it", standard_account_cannot_open_it)
    check("report-access", "standard account cannot export it", standard_account_cannot_export_it)
    check("report-access", "the author can still open it", owner_can_still_open_it)
    check("report-access", "another person's conversation is private", another_persons_chat_is_private)


def group_scope(ctx):
    token = ctx["admin"]
    docs = documents(token)
    sop = next(d for d in docs if d["doc_code"] == "SOP-HYD-014")

    def doc_scoped_report():
        report = request("/reports/generate", token=token, body={
            "question": "hydraulic remedial action", "title": "QA scope check",
            "sections": [{"key": "s", "label": "Summary", "prompt": "the remedial action"}],
            "scope": {"doc_ids": [sop["id"]]}, "depth": "brief", "chart": "none"})
        ctx["cleanup_reports"].append(report["id"])
        cited = {c["doc"] for s in report["sections"] for c in s["citations"]}
        assert cited, "doc-scoped generation produced no citations at all"
        assert cited == {"SOP-HYD-014"}, f"scope leaked beyond the chosen document: {cited}"

    def doc_type_filter():
        out = request("/query", token=token, body={
            "question": "hydraulic filter", "scope": {"doc_types": ["record"]}})
        docs_hit = {e["doc_code"] for e in out.get("evidence") or []}
        assert docs_hit, "doc_type filter returned nothing at all"
        types = {d["doc_code"]: d["doc_type"] for d in docs}
        wrong = {d for d in docs_hit if types.get(d) not in (None, "record")}
        assert not wrong, f"doc_type filter returned non-records: {wrong}"

    check("scope", "report scoped to one document cites only it", doc_scoped_report)
    check("scope", "doc_type filter restricts retrieval", doc_type_filter)


def group_conversation(ctx):
    token = ctx["admin"]

    def follow_up_resolves_pronoun():
        session = new_session(token)
        first = turn(token, session, "What is the maximum winch line pull on the ARV-5?")
        assert first.get("grounded"), "first turn did not answer"
        second = turn(token, session, "And when should a snatch block be used?")
        text = (second.get("answer") or "").lower()
        assert second.get("grounded"), "follow-up lost the conversation's subject"
        assert "snatch block" in text or "double" in text, \
            f"follow-up answered something else — {text[:160]}"

    def session_replays():
        session = new_session(token)
        turn(token, session, "Which filter is specified for hydraulic under-pressure remediation?")
        stored = request(f"/chat/sessions/{session}", token=token)
        kinds = [(m["role"], (m.get("meta") or {}).get("kind")) for m in stored["messages"]]
        assert ("user", None) in [(r, k) for r, k in kinds] or kinds[0][0] == "user", \
            f"user turn was not persisted: {kinds}"
        assert any(k == "answer" for _, k in kinds), f"assistant card was not stored: {kinds}"

    def title_follows_first_message():
        session = new_session(token)
        turn(token, session, "What torque is specified for the hydraulic ram seal gland nut?")
        stored = request(f"/chat/sessions/{session}", token=token)
        assert stored["title"] != "QA", "session kept its placeholder title"

    def standalone_question_survives_history():
        """A question that needs no context must not be answered *worse* for
        having been asked second. The rewriter used to graft the conversation's
        subject onto it ("...for the ARV-5?"), retrieving off-target evidence
        that scored high enough to clear the abstain gate — so the model was
        handed the wrong passages and refused, and the turn came back blank."""
        session = new_session(token)
        turn(token, session, "What is the maximum winch line pull on the ARV-5?")
        turn(token, session, "What brake fluid does the ARV-5 use?")
        out = turn(token, session, "Is there a lifting embargo in place?")
        text = (out.get("answer") or "").lower()
        assert out.get("grounded"), \
            "a self-contained question went unanswered because of earlier turns"
        assert "embargo" in text, f"answered something else — {text[:160]}"

    check("conversation", "follow-up keeps the subject", follow_up_resolves_pronoun)
    check("conversation", "a standalone question survives history",
          standalone_question_survives_history)
    check("conversation", "turns persist and replay with their cards", session_replays)
    check("conversation", "session is titled from the first message", title_follows_first_message)


def group_reports(ctx):
    token = ctx["admin"]
    session = new_session(token)
    state = {}

    def intent_routing():
        out = turn(token, session, "Generate a report on fleet serviceability")
        assert out.get("kind") == "plan", f"report request produced a {out.get('kind')} card"
        state["plan"] = out["plan"]

    def plan_is_usable():
        plan = state["plan"]
        assert 2 <= len(plan["sections"]) <= 6, f"outline has {len(plan['sections'])} sections"
        assert plan.get("title"), "plan has no title"
        for q in plan["questions"]:
            rec = [o for o in q["options"] if o.get("recommended")]
            assert len(rec) == 1, f"question {q['id']} has {len(rec)} recommended options"
        ids = {q["id"] for q in plan["questions"]}
        assert {"sources", "chart", "depth"} <= ids, f"missing questions: {ids}"

    def generate_from_plan():
        plan = state["plan"]
        report = request("/reports/generate", token=token, body={
            "question": "fleet serviceability", "title": plan["title"],
            "sections": plan["sections"], "scope": {}, "depth": "standard",
            "chart": "bar", "session_id": session})
        state["report"] = report
        ctx["cleanup_reports"].append(report["id"])
        assert len(report["sections"]) == len(plan["sections"]), "sections went missing"
        # Every section is either cited, or explicitly marked as unsupported by
        # the sources. Uncited prose presented as findings is the failure mode.
        uncited = [s["label"] for s in report["sections"]
                   if not s["citations"] and not s.get("unsupported")]
        assert not uncited, f"section(s) written with no citations and no marker: {uncited}"
        assert report["charts"], "no chart was produced for a fleet question"
        assert report["charts"][0]["source"] == "records", \
            f"fleet chart came from {report['charts'][0]['source']}, expected records"

    def report_lands_in_the_conversation():
        stored = request(f"/chat/sessions/{session}", token=token)
        kinds = [(m.get("meta") or {}).get("kind") for m in stored["messages"]]
        assert "report" in kinds, f"generated report is not in the transcript: {kinds}"

    def revise_chart():
        out = request(f"/reports/{state['report']['id']}/revise", token=token,
                      body={"instruction": "use a donut chart instead"})
        types = [c["type"] for c in out["charts"]]
        assert types == ["pie"], f"chart is {types}, expected a donut"
        # `changed` is the outcome record, not prose: {"op", "applied", "chart"}.
        # Substring-matching a dict tests its *keys*, so this assertion could
        # never pass however the agent behaved.
        assert out["changed"].get("applied") and out["changed"].get("chart") == "pie", \
            f"change summary is misleading: {out['changed']}"

    def revise_add_section():
        before = len(state["report"]["sections"])
        out = request(f"/reports/{state['report']['id']}/revise", token=token,
                      body={"instruction": "add a section on spares holdings"})
        assert len(out["sections"]) == before + 1, "section was not added"
        state["report"] = out

    def revise_remove_section():
        target = state["report"]["sections"][-1]["key"]
        before = len(state["report"]["sections"])
        out = request(f"/reports/{state['report']['id']}/revise", token=token,
                      body={"instruction": f"remove the {target.replace('_', ' ')} section"})
        assert len(out["sections"]) == before - 1, \
            f"section {target} was not removed ({before} -> {len(out['sections'])})"
        state["report"] = out

    def revise_retitle():
        out = request(f"/reports/{state['report']['id']}/revise", token=token,
                      body={"instruction": "rename the title to Q2 Hydraulic Readiness"})
        assert "readiness" in out["title"].lower(), f"title is still {out['title']!r}"
        state["report"] = out

    def revise_rewrite_keeps_citations():
        first = state["report"]["sections"][0]
        out = request(f"/reports/{state['report']['id']}/revise", token=token,
                      body={"instruction": f"make the {first['label'].lower()} shorter"})
        rewritten = next(s for s in out["sections"] if s["key"] == first["key"])
        assert rewritten["citations"], "rewrite dropped the section's citations"
        assert rewritten["value"], "rewrite emptied the section"
        state["report"] = out

    def chart_from_documents_not_records():
        docs = documents(token)
        sop = next(d for d in docs if d["doc_code"] == "SOP-HYD-014")
        report = request("/reports/generate", token=token, body={
            "question": "hydraulic inspection procedure", "title": "QA chart source",
            "sections": [{"key": "s", "label": "Procedure", "prompt": "the steps"}],
            "scope": {"doc_ids": [sop["id"]]}, "depth": "brief", "chart": "bar"})
        ctx["cleanup_reports"].append(report["id"])
        for chart in report["charts"]:
            assert chart["source"] != "records", \
                "a document-scoped report was given an unrelated fleet chart"

    def export_pdf():
        data = request(f"/reports/{state['report']['id']}/export?format=pdf",
                       token=token, body={"chart_images": []}, raw=True)
        assert data[:5] == b"%PDF-", "export is not a PDF"
        assert len(data) > 2000, f"PDF is suspiciously small ({len(data)} bytes)"

    def export_docx():
        data = request(f"/reports/{state['report']['id']}/export?format=docx",
                       token=token, body={"chart_images": []}, raw=True)
        zf = zipfile.ZipFile(io.BytesIO(data))
        xml = zf.read("word/document.xml").decode("utf-8", "replace")
        assert "word/document.xml" in zf.namelist(), "not a Word document"
        assert "Sources" in xml, "export carries no sources list"

    def reports_list_and_fetch():
        ids = {r["id"] for r in reports(token)}
        assert state["report"]["id"] in ids, "generated report is missing from the list"
        one = request(f"/reports/{state['report']['id']}", token=token)
        assert one["sections"], "fetched report has no sections"

    for name, fn in [
        ("a report request returns a plan, not a report", intent_routing),
        ("the plan is complete and has one recommendation per question", plan_is_usable),
        ("generating produces cited sections and a records chart", generate_from_plan),
        ("the report is added to the conversation", report_lands_in_the_conversation),
        ("revision: switch to a donut chart", revise_chart),
        ("revision: add a section", revise_add_section),
        ("revision: remove a section", revise_remove_section),
        ("revision: rename the report", revise_retitle),
        ("revision: rewrite keeps citations", revise_rewrite_keeps_citations),
        ("a document report is never given a fleet chart", chart_from_documents_not_records),
        ("PDF export opens and is complete", export_pdf),
        ("Word export opens and lists sources", export_docx),
        ("the report is listed and can be reopened", reports_list_and_fetch),
    ]:
        check("reports", name, fn)


def group_ingest(ctx):
    token = ctx["admin"]
    filename = "QA-UPLOAD-01.txt"
    state = {}

    def upload_and_process():
        res = request("/documents", token=token, form={
            "fields": {"collection": "veh-recovery", "doc_type": "manual",
                       "classification": "UNCLASSIFIED", "revision": "A"},
            "files": [(filename, QA_DOC_TEXT.encode())]})
        job = res["job_id"]
        for _ in range(80):
            status = request(f"/ingestion/jobs/{job}", token=token)
            if status["status"] != "running":
                state["job"] = status
                break
            time.sleep(2)
        else:
            raise AssertionError("ingestion never finished (is the worker running?)")
        files = state["job"]["files"]
        assert files and files[0]["status"] == "ok", f"upload failed: {files}"

    def appears_in_library():
        docs = documents(token)
        doc = next((d for d in docs if d["doc_code"] == "QA-UPLOAD-01"), None)
        assert doc, "uploaded document is not in the library"
        state["doc_id"] = doc["id"]
        ctx["cleanup_docs"].append(doc["id"])

    def answers_from_the_new_document():
        out = turn(token, new_session(token),
                   "What is the QA calibration torque for the zephyr coupling?")
        assert out.get("grounded"), "the new document did not become answerable"
        assert "47" in (out.get("answer") or ""), \
            f"answer missed the fact — {(out.get('answer') or '')[:160]}"
        assert "QA-UPLOAD-01" in cited_docs(out), f"cited {cited_docs(out)} instead"

    def duplicate_is_skipped():
        res = request("/documents", token=token, form={
            "fields": {"collection": "veh-recovery", "doc_type": "manual"},
            "files": [("QA-UPLOAD-01-copy.txt", QA_DOC_TEXT.encode())]})
        for _ in range(60):
            status = request(f"/ingestion/jobs/{res['job_id']}", token=token)
            if status["status"] != "running":
                break
            time.sleep(2)
        files = status["files"]
        assert files and files[0]["status"] == "skipped", \
            f"re-uploading identical content should be skipped, got {files}"

    def delete_removes_it_from_answers():
        request(f"/documents/{state['doc_id']}", token=token, method="DELETE")
        ctx["cleanup_docs"].remove(state["doc_id"])
        time.sleep(2)
        out = turn(token, new_session(token),
                   "What is the QA calibration torque for the zephyr coupling?")
        assert "QA-UPLOAD-01" not in cited_docs(out), \
            "a deleted document is still being cited"

    check("ingest", "upload is accepted and processed", upload_and_process)
    check("ingest", "the document appears in the library", appears_in_library)
    check("ingest", "the new document answers a question only it can answer",
          answers_from_the_new_document)
    check("ingest", "re-uploading identical content is skipped", duplicate_is_skipped)
    check("ingest", "deleting it stops it being cited", delete_removes_it_from_answers)


def group_people(ctx):
    token = ctx["admin"]
    username = "qa_tester"

    def create_person():
        existing = {u["subject"] for u in request("/users", token=token)}
        if username in existing:
            # A previous run left them disabled; re-enable so the suite is re-runnable.
            request(f"/users/{username}", token=token, body={"disabled": False},
                    method="PATCH")
        else:
            request("/users", token=token, body={
                "username": username, "password": "QaTester!123",
                "display_name": "QA Tester", "role": "user", "clearance": 1})
        ctx["cleanup_users"].append(username)
        assert username in {u["subject"] for u in request("/users", token=token)}, \
            "new person was not created"

    def new_person_can_sign_in():
        token_new = request("/auth/login", body={"username": username,
                                                 "password": "QaTester!123"})["access_token"]
        me = request("/auth/me", token=token_new)
        assert me["role"] == "user", f"new person got role {me['role']}"

    def disabled_person_cannot_sign_in():
        request(f"/users/{username}", token=token, body={"disabled": True}, method="PATCH")
        code = status_of("/auth/login", body={"username": username, "password": "QaTester!123"})
        assert code == 403, f"disabled account should be refused with 403, got {code}"

    check("people", "an administrator can add someone", create_person)
    check("people", "the new person can sign in", new_person_can_sign_in)
    check("people", "removing access blocks sign-in", disabled_person_cannot_sign_in)


def group_taxonomy(ctx):
    token = ctx["admin"]

    def area_created_renamed_and_listed():
        created = request("/collections", token=token,
                          body={"name": "QA- Field Trials", "description": "temp"})
        assert created["slug"] == "qa-field-trials", f"unexpected slug: {created['slug']}"
        ctx["cleanup_collections"].append(created["slug"])
        renamed = request(f"/collections/{created['slug']}", token=token,
                          body={"name": "QA- Field Trials Renamed"}, method="PATCH")
        assert renamed["name"] == "QA- Field Trials Renamed", "rename did not stick"
        slugs = {c["slug"] for c in request("/collections", token=token)}
        assert created["slug"] in slugs, "renamed area missing from the list"

    def kind_created_renamed_and_listed():
        created = request("/doc-kinds", token=token, body={"name": "QA- Checklist"})
        assert created["slug"] == "qa-checklist", f"unexpected slug: {created['slug']}"
        ctx["cleanup_doc_kinds"].append(created["slug"])
        renamed = request(f"/doc-kinds/{created['slug']}", token=token,
                          body={"name": "QA- Checklist Renamed"}, method="PATCH")
        assert renamed["name"] == "QA- Checklist Renamed", "rename did not stick"
        slugs = {k["slug"] for k in request("/doc-kinds", token=token)}
        assert created["slug"] in slugs, "renamed kind missing from the list"

    def area_in_use_cannot_be_deleted():
        code = status_of("/collections/veh-recovery", token=token, method="DELETE")
        assert code == 409, f"a knowledge area with documents should refuse deletion, got {code}"

    def kind_in_use_cannot_be_deleted():
        code = status_of("/doc-kinds/manual", token=token, method="DELETE")
        assert code == 409, f"a document kind with documents should refuse deletion, got {code}"

    def unused_area_and_kind_delete_cleanly():
        request(f"/collections/{ctx['cleanup_collections'].pop()}", token=token, method="DELETE")
        request(f"/doc-kinds/{ctx['cleanup_doc_kinds'].pop()}", token=token, method="DELETE")

    def analyst_cannot_create():
        code = status_of("/collections", token=ctx["analyst"], body={"name": "Should Fail"})
        assert code == 403, f"a non-admin creating a knowledge area should be 403, got {code}"

    check("taxonomy", "an admin can add a knowledge area, rename it and see it listed",
          area_created_renamed_and_listed)
    check("taxonomy", "an admin can add a document kind, rename it and see it listed",
          kind_created_renamed_and_listed)
    check("taxonomy", "a knowledge area still in use cannot be deleted", area_in_use_cannot_be_deleted)
    check("taxonomy", "a document kind still in use cannot be deleted", kind_in_use_cannot_be_deleted)
    check("taxonomy", "an unused area and kind delete cleanly", unused_area_and_kind_delete_cleanly)
    check("taxonomy", "a non-admin cannot create a knowledge area", analyst_cannot_create)


def group_robustness(ctx):
    token = ctx["admin"]

    def empty_message():
        out = turn(token, new_session(token), "   ")
        assert out.get("kind") in {"text", "answer"}, f"empty message produced {out.get('kind')}"

    def very_long_message():
        out = turn(token, new_session(token), "hydraulic pressure " * 400)
        assert out.get("kind") in {"answer", "text", "plan"}, "a long message broke the turn"

    def revision_without_a_report():
        out = turn(token, new_session(token), "make it shorter")
        assert out.get("kind") in {"plan", "answer", "text"}, \
            f"a revision with no report produced {out.get('kind')}"

    def unknown_session():
        out = turn(token, "00000000-0000-0000-0000-000000000000", "hello")
        assert out.get("kind") == "error", "an unknown conversation should report an error"

    def missing_report():
        code = status_of("/reports/does-not-exist", token=token)
        assert code == 404, f"expected 404 for a missing report, got {code}"

    def generate_without_sections():
        code = status_of("/reports/generate", token=token, body={
            "question": "x", "title": "x", "sections": [], "scope": {}})
        assert code == 400, f"a report with no sections should be 400, got {code}"

    check("robustness", "an empty message is handled", empty_message)
    check("robustness", "a very long message is handled", very_long_message)
    check("robustness", "a revision with no report falls back", revision_without_a_report)
    check("robustness", "an unknown conversation errors cleanly", unknown_session)
    check("robustness", "a missing report is a 404", missing_report)
    check("robustness", "a report with no sections is rejected", generate_without_sections)


def cleanup(ctx):
    token = ctx.get("admin")
    if not token:
        return
    print("\ncleanup")
    for report_id in ctx["cleanup_reports"]:
        try:
            request(f"/reports/{report_id}", token=token, method="DELETE")
        except Exception:  # noqa: BLE001
            pass
    for doc_id in ctx["cleanup_docs"]:
        try:
            request(f"/documents/{doc_id}", token=token, method="DELETE")
        except Exception:  # noqa: BLE001
            pass
    for username in ctx["cleanup_users"]:
        try:
            # Delete, not disable. Disabling blocks sign-in but leaves the row, so
            # every run used to add another dead account to the admin console.
            request(f"/users/{username}", token=token, method="DELETE")
        except Exception:  # noqa: BLE001
            pass
    for slug in ctx["cleanup_collections"]:
        try:
            request(f"/collections/{slug}", token=token, method="DELETE")
        except Exception:  # noqa: BLE001
            pass
    for slug in ctx["cleanup_doc_kinds"]:
        try:
            request(f"/doc-kinds/{slug}", token=token, method="DELETE")
        except Exception:  # noqa: BLE001
            pass
    # Deleted with the owner's token: a conversation is only visible to the
    # account that had it, so admin cannot clear the analyst's.
    for owner, session_id in _sessions:
        try:
            request(f"/chat/sessions/{session_id}", token=owner, method="DELETE")
        except Exception:  # noqa: BLE001
            pass
    seeded = {d["doc_code"] for d in documents(token)}
    for code in ("OM-VEH-001", "SOP-HYD-014", "INS-REC-2207", "ENG-NOTE-880", "SCAN-LOG-4471"):
        if code not in seeded:
            print(f"  WARNING: seeded document {code} is missing from the corpus")
    print(f"  removed {len(ctx['cleanup_reports'])} report(s), "
          f"{len(ctx['cleanup_docs'])} document(s), {len(_sessions)} conversation(s), "
          f"{len(ctx['cleanup_users'])} user(s)")


GROUPS = {
    "auth": group_auth,
    "answers": group_answers,
    "clearance": group_clearance,
    "report-access": group_report_access,
    "scope": group_scope,
    "conversation": group_conversation,
    "reports": group_reports,
    "ingest": group_ingest,
    "people": group_people,
    "taxonomy": group_taxonomy,
    "robustness": group_robustness,
}


def main() -> int:
    global API
    parser = argparse.ArgumentParser(description="DKIP end-to-end API checks")
    parser.add_argument("--api", default=API)
    parser.add_argument("--group", action="append", choices=list(GROUPS),
                        help="run only these groups (repeatable)")
    parser.add_argument("--skip-ingest", action="store_true",
                        help="skip upload tests (needs the worker container)")
    args = parser.parse_args()
    API = args.api.rstrip("/")

    health = json.loads(urllib.request.urlopen(
        API.replace("/api/v1", "") + "/health", timeout=30).read())
    print(f"API {API} — {health['status']}")
    for name, info in health["checks"].items():
        if info.get("reachable") is False:
            print(f"  WARNING: {name} is unreachable")

    ctx = {"cleanup_docs": [], "cleanup_reports": [], "cleanup_users": [],
           "cleanup_collections": [], "cleanup_doc_kinds": []}
    for user in ACCOUNTS:
        ctx[user] = login(user)

    selected = args.group or list(GROUPS)
    if args.skip_ingest and "ingest" in selected:
        selected.remove("ingest")

    started = time.time()
    try:
        for name in selected:
            print(f"\n{name}")
            GROUPS[name](ctx)
    finally:
        cleanup(ctx)

    print("\n" + "=" * 62)
    by_group: dict[str, list[int]] = {}
    for group, _, detail in results:
        stats = by_group.setdefault(group, [0, 0])
        stats[0 if not detail else 1] += 1
    for group, (passed, failed) in by_group.items():
        print(f"  {group:<14} {passed:>3} passed  {failed:>3} failed")
    print("=" * 62)
    print(f"  {len(results) - failures}/{len(results)} checks passed "
          f"in {time.time() - started:.0f}s")
    if failures:
        print("\nfailures:")
        for group, name, detail in results:
            if detail:
                print(f"  [{group}] {name}\n      {detail}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
