"""Reports: plan → generate → revise → export.

Reports are built from a conversation, not from a stored template — the agent
proposes an outline, the user adjusts it, and generation runs against that.
Templates remain only as optional admin-managed presets."""
from __future__ import annotations

import base64

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from dkip.api.schemas import Scope
from dkip.core import audit
from dkip.core.deps import Principal, current_user, require_role
from dkip.db.base import get_db
from dkip.db.models import ChatMessage, ChatSession, Report, ReportTemplate
from dkip.reports import agent
from dkip.reports.export import to_docx, to_pdf

router = APIRouter(tags=["reports"])


class PlanIn(BaseModel):
    question: str
    session_id: str | None = None
    scope: Scope = Scope()


class SectionIn(BaseModel):
    key: str = ""
    label: str
    prompt: str = ""


class GenerateIn(BaseModel):
    question: str = ""
    title: str = ""
    sections: list[SectionIn] = []
    scope: Scope = Scope()
    depth: str = "standard"
    chart: str = "none"
    session_id: str | None = None


class ReviseIn(BaseModel):
    instruction: str


class ChartImage(BaseModel):
    key: str = ""
    png_base64: str


class ExportIn(BaseModel):
    chart_images: list[ChartImage] = []


class TemplateIn(BaseModel):
    name: str
    description: str = ""
    fields: list = []


def _report_or_404(db: Session, report_id: str, user: Principal) -> Report:
    r = db.get(Report, report_id)
    if not r or r.org_id != user.org_id:
        raise HTTPException(404, "report not found")
    # A report quoting a confidential document is as sensitive as the document.
    # 404 rather than 403: below the required clearance it should not even be
    # apparent that the report exists.
    if (r.min_clearance or 1) > user.clearance:
        raise HTTPException(404, "report not found")
    return r


def _out(r: Report) -> dict:
    return {"id": r.id, "title": r.title, "status": r.status,
            "session_id": r.session_id, "scope": r.scope,
            "created_at": r.created_at.isoformat(), **(r.draft or {})}


@router.post("/reports/plan")
def plan(body: PlanIn, user: Principal = Depends(current_user),
         db: Session = Depends(get_db)):
    """What to ask the user before spending a minute generating."""
    return agent.plan_report(db, question=body.question, user=user,
                             scope=body.scope.model_dump())


@router.post("/reports/generate")
def generate(body: GenerateIn, user: Principal = Depends(current_user),
             db: Session = Depends(get_db)):
    sections = [s.model_dump() for s in body.sections]
    for i, s in enumerate(sections):
        s["key"] = s.get("key") or f"section_{i}"
    if not sections:
        raise HTTPException(400, "a report needs at least one section")
    report = agent.generate_report(
        db, question=body.question or body.title, title=body.title,
        sections=sections, scope=body.scope.model_dump(), depth=body.depth,
        chart=body.chart, user=user, session_id=body.session_id)
    if body.session_id:
        s = db.get(ChatSession, body.session_id)
        if s:
            s.last_report_id = report.id
            # Record the report as the assistant's turn, so reopening the chat
            # replays the report itself instead of the plan that preceded it.
            db.add(ChatMessage(
                session_id=s.id, role="assistant", content=report.title,
                meta={"kind": "report", "report_id": report.id,
                      "title": report.title, **(report.draft or {})}))
    audit.record(db, action="report_generate", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="report",
                 target_id=report.id,
                 request_meta={"sections": len(sections), "chart": body.chart})
    db.commit()
    return _out(report)


@router.post("/reports/{report_id}/revise")
def revise(report_id: str, body: ReviseIn, user: Principal = Depends(current_user),
           db: Session = Depends(get_db)):
    r = _report_or_404(db, report_id, user)
    _, changed = agent.revise_report(db, report=r, instruction=body.instruction, user=user)
    audit.record(db, action="report_revise", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="report",
                 target_id=r.id, request_meta={"instruction": body.instruction})
    db.commit()
    return {**_out(r), "changed": changed}


@router.get("/reports")
def list_reports(user: Principal = Depends(current_user), db: Session = Depends(get_db),
                 limit: int = 25, offset: int = 0):
    """A window over the archive. Replaces a hardcoded .limit(100) that silently
    hid everything older once an org passed a hundred reports."""
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    stmt = select(Report).where(Report.org_id == user.org_id,
                                Report.min_clearance <= user.clearance)
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar() or 0
    rows = db.execute(stmt.order_by(Report.created_at.desc())
                      .limit(limit).offset(offset)).scalars().all()
    return {"items": [{"id": r.id, "title": r.title, "session_id": r.session_id,
                       "created_at": r.created_at.isoformat(),
                       "sections": len((r.draft or {}).get("sections") or []),
                       "sources": len({c["chunk_id"] for s in (r.draft or {}).get("sections") or []
                                       for c in s.get("citations") or []})}
                      for r in rows],
            "total": total, "limit": limit, "offset": offset}


@router.get("/reports/{report_id}")
def get_report(report_id: str, user: Principal = Depends(current_user),
               db: Session = Depends(get_db)):
    return _out(_report_or_404(db, report_id, user))


@router.patch("/reports/{report_id}")
def edit(report_id: str, body: dict, user: Principal = Depends(current_user),
         db: Session = Depends(get_db)):
    """Direct draft edit (manual text tweaks from the report view)."""
    r = _report_or_404(db, report_id, user)
    r.draft = body.get("draft", r.draft)
    if body.get("title"):
        r.title = body["title"]
    db.commit()
    return _out(r)


@router.delete("/reports/{report_id}", status_code=204)
def delete_report(report_id: str, user: Principal = Depends(current_user),
                  db: Session = Depends(get_db)):
    db.delete(_report_or_404(db, report_id, user))
    db.commit()


@router.post("/reports/{report_id}/export")
def export(report_id: str, body: ExportIn | None = None, format: str = "pdf",
           user: Principal = Depends(current_user), db: Session = Depends(get_db)):
    r = _report_or_404(db, report_id, user)
    draft = r.draft or {}
    images = []
    for img in (body.chart_images if body else []) or []:
        try:
            images.append({"key": img.key,
                           "png": base64.b64decode(img.png_base64.split(",")[-1])})
        except Exception:  # noqa: BLE001 — a bad image must not fail the export
            continue
    payload = {"title": r.title, "scope": r.scope,
               "sections": draft.get("sections", []),
               "charts": draft.get("charts", []), "chart_images": images}
    audit.record(db, action="report_export", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="report",
                 target_id=r.id, request_meta={"format": format})
    db.commit()
    if format == "docx":
        data = to_docx(payload)
        media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        fn = f"{r.title}.docx"
    else:
        data, media, fn = to_pdf(payload), "application/pdf", f"{r.title}.pdf"
    return Response(content=data, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{fn}"'})


# ---- Templates: admin-managed presets, not part of the chat flow ------------

@router.get("/report-templates")
def templates(user: Principal = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(ReportTemplate)).scalars().all()
    return [{"id": t.id, "name": t.name, "description": t.description,
             "fields": t.fields} for t in rows]


@router.post("/report-templates", status_code=201)
def create_template(body: TemplateIn, user: Principal = Depends(require_role("admin")),
                    db: Session = Depends(get_db)):
    tpl = ReportTemplate(org_id=user.org_id, name=body.name,
                         description=body.description, fields=body.fields)
    db.add(tpl)
    db.flush()
    audit.record(db, action="template_create", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id,
                 target_type="report_template", target_id=tpl.id)
    db.commit()
    return {"id": tpl.id, "name": tpl.name, "description": tpl.description,
            "fields": tpl.fields}
