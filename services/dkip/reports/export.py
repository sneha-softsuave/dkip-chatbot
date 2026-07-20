"""Report export to PDF + DOCX with classification header/footer + citations
intact (§5.10, FR-5.4.4)."""
from __future__ import annotations

import io

from dkip.core.config import settings


def to_pdf(report: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate,
                                    Paragraph, Spacer)

    buf = io.BytesIO()
    banner = settings.CLASSIFICATION_BANNER
    styles = getSampleStyleSheet()

    def _chrome(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica-Bold", 8)
        w, h = A4
        for y in (h - 12 * mm, 8 * mm):
            canvas.setFillColorRGB(0.10, 0.32, 0.18)
            canvas.rect(0, y, w, 8 * mm, fill=1, stroke=0)
            canvas.setFillColorRGB(1, 1, 1)
            canvas.drawCentredString(w / 2, y + 2.4 * mm, banner)
        canvas.restoreState()

    doc = BaseDocTemplate(buf, pagesize=A4, topMargin=22 * mm, bottomMargin=20 * mm)
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=_chrome)])

    flow = [Paragraph(report.get("title", "Report"), styles["Title"]),
            Paragraph(f"Template: {report.get('template','')} · Scope: "
                      f"{report.get('scope','')}", styles["Italic"]),
            Spacer(1, 6 * mm)]
    for field in report.get("fields", []):
        flow.append(Paragraph(field["label"], styles["Heading2"]))
        flow.append(Paragraph(field.get("value", "").replace("\n", "<br/>"),
                              styles["BodyText"]))
        flow.append(Spacer(1, 4 * mm))
    doc.build(flow)
    return buf.getvalue()


def to_docx(report: dict) -> bytes:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    d = Document()
    banner = d.sections[0].header.paragraphs[0]
    banner.text = settings.CLASSIFICATION_BANNER
    banner.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer = d.sections[0].footer.paragraphs[0]
    footer.text = settings.CLASSIFICATION_BANNER
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER

    d.add_heading(report.get("title", "Report"), 0)
    d.add_paragraph(f"Template: {report.get('template','')} · Scope: {report.get('scope','')}"
                    ).italic = True
    for field in report.get("fields", []):
        d.add_heading(field["label"], level=2)
        d.add_paragraph(field.get("value", ""))
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()
