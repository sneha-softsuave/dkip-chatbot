"""Report generation (§9.2, §5.10, minimal). Template fields are filled with
cited retrieval values or structured metrics, returned as an editable draft,
then exported to PDF/DOCX with classification marking."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from dkip.core import audit
from dkip.core.deps import Principal, current_user, require_role
from dkip.db.base import get_db
from dkip.db.models import Report, ReportTemplate
from dkip.reports.export import to_docx, to_pdf
from dkip.rag.summarize import summarize_topic
from dkip.structured.engine import fleet_aggregates

router = APIRouter(tags=["reports"])


class GenerateIn(BaseModel):
    template_id: str
    title: str = ""
    topic: str = "fleet inspection and serviceability"
    scope: dict = {}


class PatchIn(BaseModel):
    draft: dict


class TemplateIn(BaseModel):
    name: str
    description: str = ""
    fields: list = []


@router.get("/report-templates")
def templates(user: Principal = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(ReportTemplate)).scalars().all()
    return [{"id": t.id, "name": t.name, "description": t.description,
             "fields": t.fields} for t in rows]


@router.post("/report-templates", status_code=201)
def create_template(body: TemplateIn,
                    user: Principal = Depends(require_role("admin")),
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


@router.post("/reports")
def generate(body: GenerateIn, user: Principal = Depends(current_user),
             db: Session = Depends(get_db)):
    tpl = db.get(ReportTemplate, body.template_id)
    if not tpl:
        raise HTTPException(404, "template not found")
    fields = []
    for f in tpl.fields:
        if f["type"] == "metric":
            agg = fleet_aggregates(db).get("kpi", {})
            val = f"Serviceable: {agg.get('s', 'n/a')} of {agg.get('t', 'n/a')} total holdings."
            fields.append({"key": f["key"], "label": f["label"], "value": val, "citations": []})
        else:
            s = summarize_topic(db, topic=f"{f['label']}: {body.topic}",
                                scope=body.scope, fmt="detailed", user=user)
            fields.append({"key": f["key"], "label": f["label"],
                           "value": s["summary"], "citations": s["citations"]})
    report = Report(org_id=user.org_id, template_id=tpl.id,
                    title=body.title or tpl.name, scope=body.scope,
                    draft={"template": tpl.name, "fields": fields}, status="draft")
    db.add(report); db.flush()
    audit.record(db, action="report_generate", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="report",
                 target_id=report.id, request_meta={"template": tpl.name})
    db.commit()
    return {"id": report.id, "title": report.title, "template": tpl.name,
            "fields": fields, "status": report.status}


@router.patch("/reports/{report_id}")
def edit(report_id: str, body: PatchIn, user: Principal = Depends(current_user),
         db: Session = Depends(get_db)):
    r = db.get(Report, report_id)
    if not r:
        raise HTTPException(404, "not found")
    r.draft = body.draft
    db.commit()
    return {"id": r.id, "status": "saved"}


@router.post("/reports/{report_id}/export")
def export(report_id: str, format: str = "pdf",
           user: Principal = Depends(current_user), db: Session = Depends(get_db)):
    r = db.get(Report, report_id)
    if not r:
        raise HTTPException(404, "not found")
    payload = {"title": r.title, "template": r.draft.get("template", ""),
               "scope": r.scope, "fields": r.draft.get("fields", [])}
    audit.record(db, action="report_export", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="report",
                 target_id=r.id, request_meta={"format": format})
    if format == "docx":
        data = to_docx(payload)
        media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        fn = f"{r.title}.docx"
    else:
        data = to_pdf(payload)
        media, fn = "application/pdf", f"{r.title}.pdf"
    return Response(content=data, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{fn}"'})
