"""Conversation surface. Sessions persist every turn so follow-ups ("make it
shorter") resolve against real history — the query rewriter in rag/pipeline.py
already reads ChatMessage, it just never had anything to read."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from dkip.agent import router as intent
from dkip.api.schemas import Scope
from dkip.core import audit
from dkip.core.deps import Principal, current_user
from dkip.core.llm_json import json_call
from dkip.db.base import SessionLocal, get_db
from dkip.db.models import ChatMessage, ChatSession, Document, Report, User
from dkip.gateway.factory import make_gateway
from dkip.rag import pipeline
from dkip.reports import agent as report_agent
from dkip.reports import narrate as speak

router = APIRouter(tags=["chat"])

_OPENER = """You are the assistant in a document-analysis chat for a defence
knowledge platform. The user just said: "{message}"

It is not a question you can answer from documents and not a request for a
report — it is a greeting, an aside, or too vague to act on.

Reply naturally in one or two sentences, and offer two or three specific things
you could do next, phrased as things they might say.

Return JSON: {{"text": str, "suggestions": [str]}}"""

_FOLLOW_UP = """A user asked: "{question}"

The document library could not support an answer.

Suggest two or three ways they might get further: a narrower phrasing, a
different angle, or naming a document to look in. Base them on their actual
question, not on generic advice.

Return JSON: {{"suggestions": [str]}}"""

_STARTERS = """These are the documents available in a defence knowledge library:

{titles}

Write three questions a new user could usefully ask about this material. Each
should be answerable from documents like these and specific enough to be worth
asking. Keep each under 90 characters.

Return JSON: {{"starters": [str]}}"""


def _suggestions(gateway, prompt: str, key: str = "suggestions") -> list[str]:
    """Follow-ups written for this conversation. Returns [] rather than falling
    back to a fixed list — an empty tail is honest, a canned one is not."""
    try:
        data = json_call(gateway, prompt, max_tokens=220)
        items = (data or {}).get(key) if isinstance(data, dict) else None
        return [str(x)[:120] for x in items][:3] if isinstance(items, list) else []
    except Exception:
        return []


class SessionIn(BaseModel):
    title: str = "New chat"


class TurnIn(BaseModel):
    session_id: str
    message: str
    scope: Scope = Scope()


def _owner_id(db: Session, user: Principal) -> str | None:
    """users.id for the caller. SSO tokens carry no `uid`, so fall back to the
    subject lookup rather than writing a null FK."""
    if user.user_id:
        return user.user_id
    row = db.execute(select(User.id).where(User.subject == user.subject)).scalar_one_or_none()
    return row


def _session_or_404(db: Session, session_id: str, user: Principal) -> ChatSession:
    s = db.get(ChatSession, session_id)
    if not s or s.org_id != user.org_id:
        raise HTTPException(404, "chat not found")
    # A conversation belongs to the person who had it. Org membership is not
    # enough: a stored turn can hold a report card quoting a confidential
    # document, so anything less than an owner check leaks it sideways.
    # An unresolvable caller is refused rather than waved through: the old
    # `and owner` skipped the check entirely when the token mapped to no user
    # row, which made every conversation in the org readable. Nobody can own a
    # session in that state either — chat_sessions.user_id is NOT NULL — so
    # there is nothing legitimate to let through.
    owner = _owner_id(db, user)
    if s.user_id != owner:
        raise HTTPException(404, "chat not found")
    return s


def _msg_out(m: ChatMessage) -> dict:
    return {"id": m.id, "role": m.role, "content": m.content,
            "meta": m.meta or {}, "created_at": m.created_at.isoformat()}


@router.post("/chat/sessions", status_code=201)
def create_session(body: SessionIn, user: Principal = Depends(current_user),
                   db: Session = Depends(get_db)):
    s = ChatSession(org_id=user.org_id, user_id=_owner_id(db, user), title=body.title)
    db.add(s)
    db.commit()
    return {"id": s.id, "title": s.title, "created_at": s.created_at.isoformat()}


@router.get("/chat/sessions")
def list_sessions(user: Principal = Depends(current_user),
                  db: Session = Depends(get_db)):
    rows = db.execute(
        select(ChatSession).where(ChatSession.org_id == user.org_id,
                                  ChatSession.user_id == _owner_id(db, user))
        .order_by(ChatSession.created_at.desc()).limit(50)).scalars().all()
    return [{"id": s.id, "title": s.title, "created_at": s.created_at.isoformat()}
            for s in rows]


@router.get("/chat/sessions/{session_id}")
def get_session(session_id: str, user: Principal = Depends(current_user),
                db: Session = Depends(get_db)):
    s = _session_or_404(db, session_id, user)
    msgs = db.execute(select(ChatMessage).where(ChatMessage.session_id == s.id)
                      .order_by(ChatMessage.created_at)).scalars().all()
    reports = db.execute(select(Report).where(Report.session_id == s.id)).scalars().all()
    return {"id": s.id, "title": s.title,
            "messages": [_msg_out(m) for m in msgs],
            "reports": [{"id": r.id, "title": r.title, "draft": r.draft} for r in reports]}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/chat/turn")
def turn(body: TurnIn, user: Principal = Depends(current_user)):
    """One conversational turn, streamed.

    Events: `meta` (intent), `token`* (answer text), `done` (the card to render:
    an answer, a report plan, or a report). The UI renders whatever `done`
    carries and stores nothing it can't replay from the session."""

    def gen():
        db = SessionLocal()
        try:
            session = db.get(ChatSession, body.session_id)
            owner = _owner_id(db, user)
            if (not session or session.org_id != user.org_id
                    or session.user_id != owner):
                yield _sse("done", {"kind": "error", "text": "chat not found"})
                return

            # Title from the opening message — keyed on "this is the first turn",
            # not on the client having sent a particular placeholder string.
            first_turn = db.execute(
                select(func.count()).select_from(ChatMessage)
                .where(ChatMessage.session_id == session.id)).scalar() == 0
            db.add(ChatMessage(session_id=session.id, role="user", content=body.message))
            if first_turn and body.message.strip():
                session.title = body.message.strip()[:60]
            db.commit()

            history = [(m.role, m.content) for m in db.execute(
                select(ChatMessage).where(ChatMessage.session_id == session.id)
                .order_by(ChatMessage.created_at.desc()).limit(6)).scalars().all()][::-1]

            gateway = make_gateway()
            # The open report goes to the router as context, so an edit phrased
            # any way at all ("make the bars maroon") is recognised as an edit to
            # *this* report rather than matched against a word list.
            open_report = db.get(Report, session.last_report_id) if session.last_report_id else None
            kind = intent.classify(gateway, body.message, history=history,
                                   report=(open_report.draft if open_report else None))
            yield _sse("meta", {"intent": kind})

            if kind == intent.REPORT_REQUEST:
                payload = _plan_turn(db, body, user)
            elif kind == intent.REPORT_REVISION:
                payload = _revision_turn(db, session, body, user)
            elif kind == intent.UNCLEAR:
                opener = json_call(gateway, _OPENER.format(message=body.message[:300]),
                                   max_tokens=220) or {}
                text = str(opener.get("text") or "").strip()
                raw = opener.get("suggestions")
                payload = {"kind": "text",
                           "text": text or "Tell me what you'd like to look into.",
                           "suggestions": [str(x)[:120] for x in raw][:3]
                                          if isinstance(raw, list) else []}
            else:
                payload = None
                for chunk in _answer_turn(db, body, session, user):
                    if isinstance(chunk, str):
                        yield chunk
                    else:
                        payload = chunk

            db.add(ChatMessage(session_id=session.id, role="assistant",
                               content=payload.get("text") or payload.get("answer") or "",
                               meta=payload))
            db.commit()
            yield _sse("done", payload)
            # After the turn is on screen, not before it: the user is never kept
            # waiting on bookkeeping.
            pipeline.fold_summary(gateway, db, session)
        except Exception as e:  # noqa: BLE001 — a failed turn must not kill the stream
            yield _sse("done", {"kind": "error", "text": str(e)})
        finally:
            db.close()

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})


def _answer_turn(db: Session, body: TurnIn, session: ChatSession, user: Principal):
    """Grounded answer. Yields SSE token frames as the model writes, then the
    final payload dict."""
    result = {}
    for kind, payload in pipeline.stream_query(
            db, question=body.message, scope=body.scope.model_dump(), user=user,
            session_id=session.id):
        if kind == "token":
            yield _sse("token", {"t": payload})
        elif kind == "stage":
            yield _sse("stage", payload)
        else:
            result = payload
    audit.record(db, action="query", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="answer",
                 target_id=result.get("answer_id"),
                 request_meta={"question": body.message,
                               "grounded": result.get("grounded"),
                               "source_chunk_ids": [c["chunk_id"] for c in
                                                    result.get("citations", [])]})
    db.commit()
    yield {"kind": "answer",
           "answer": result.get("answer"),
           "answer_marked": result.get("answer_marked"),
           "grounded": result.get("grounded", False),
           "citations": result.get("citations", []),
           "evidence": result.get("evidence", []),
           "suggestions": [] if result.get("grounded")
                          else _suggestions(make_gateway(),
                                            _FOLLOW_UP.format(question=body.message[:300]))}


_PLAN_INTRO = """A user asked for this report: "{question}"

You have drafted an outline titled "{title}" with these sections: {sections}.

Introduce it in one sentence, in your own voice, and invite them to adjust it
before you generate. Do not list the sections back — they can see them.

Return JSON: {{"text": str}}"""


def _plan_turn(db: Session, body: TurnIn, user: Principal) -> dict:
    plan = report_agent.plan_report(db, question=body.message, user=user,
                                    scope=body.scope.model_dump())
    intro = json_call(make_gateway(), _PLAN_INTRO.format(
        question=body.message[:300], title=plan.get("title", ""),
        sections=", ".join(s["label"] for s in plan.get("sections") or [])),
        max_tokens=120) or {}
    return {"kind": "plan", "plan": plan,
            "text": str(intro.get("text") or "").strip()
                    or "Here is the outline — adjust anything, then generate."}


def _revision_turn(db: Session, session: ChatSession, body: TurnIn,
                   user: Principal) -> dict:
    report = db.get(Report, session.last_report_id) if session.last_report_id else None
    if not report or report.org_id != user.org_id:
        return _plan_turn(db, body, user)
    _, outcome = report_agent.revise_report(db, report=report,
                                            instruction=body.message, user=user)
    gateway = make_gateway()

    # Something was missing rather than wrong: ask for it, with choices, instead
    # of returning a dead end the user has to guess their way out of.
    if outcome.get("needs"):
        charts = (report.draft or {}).get("charts") or []
        sections = (report.draft or {}).get("sections") or []
        context = (f"The report is titled \"{report.title}\". "
                   f"Its sections are: {', '.join(s['label'] for s in sections) or 'none'}. "
                   f"Its chart is: {charts[0].get('type') if charts else 'none'}.")
        ask = speak.clarify(gateway, instruction=body.message,
                            missing=str(outcome["needs"]), context=context)
        return {"kind": "clarify", "text": ask["text"],
                "options": _valid_options(outcome, ask["options"], sections),
                "report_id": report.id}

    audit.record(db, action="report_revise", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="report",
                 target_id=report.id, request_meta={"instruction": body.message})
    db.commit()
    return {"kind": "report", "report_id": report.id, "title": report.title,
            "text": speak.narrate(gateway, instruction=body.message, outcome=outcome),
            **(report.draft or {})}


def _valid_options(outcome: dict, options: list[dict], sections: list[dict]) -> list[dict]:
    """Only offer choices the agent can actually act on.

    The model proposes; this decides. A colour must parse as one, a chart kind
    must be one we render, a section must exist in this report. Anything else is
    dropped rather than shown as a button that would fail."""
    needs = str(outcome.get("needs") or "")
    keys = {s["key"] for s in sections}
    out = []
    for o in options:
        value = o.get("value", "")
        if needs == "colour":
            if not report_agent._COLOUR_RE.match(value):
                continue
            out.append({**o, "swatch": value})
        elif needs == "chart kind":
            if value not in report_agent._CHART_KINDS:
                continue
            out.append(o)
        elif needs.startswith("section"):
            if value not in keys:
                continue
            out.append(o)
        else:
            out.append(o)
    return out[:5]


@router.get("/chat/starters")
def starters(user: Principal = Depends(current_user), db: Session = Depends(get_db)):
    """Opening prompts drawn from the corpus this user can actually see, so the
    empty state offers questions their documents can answer. Replaces a fixed
    three-item list that named equipment the library might not hold."""
    titles = db.execute(
        select(Document.title).where(Document.clearance_required <= user.clearance)
        .order_by(Document.created_at.desc()).limit(12)).scalars().all()
    if not titles:
        return {"starters": []}
    listing = "\n".join(f"- {t}" for t in titles)
    return {"starters": _suggestions(make_gateway(),
                                     _STARTERS.format(titles=listing), key="starters")}


@router.delete("/chat/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, user: Principal = Depends(current_user),
                   db: Session = Depends(get_db)):
    s = _session_or_404(db, session_id, user)
    for m in db.execute(select(ChatMessage).where(
            ChatMessage.session_id == s.id)).scalars().all():
        db.delete(m)
    db.delete(s)
    db.commit()
