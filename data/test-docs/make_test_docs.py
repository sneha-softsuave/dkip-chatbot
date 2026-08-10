"""Generate the two documents used by docs/MANUAL-TEST-GUIDE.md.

Kept as a script rather than committed binaries so the facts inside the PDFs and
the expected answers in the guide can never drift apart: change a value here and
regenerate. Everything is fictional and deliberately unlike the seeded corpus, so
an answer citing these documents can only have come from these documents.

    python data/test-docs/make_test_docs.py
"""
from __future__ import annotations

from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                Spacer)

OUT = Path(__file__).resolve().parent

STANDARD = {
    "filename": "TEST-GEN-100.pdf",
    "banner": None,
    "title": "Operating Procedure — Field Generator Set FGS-12 (Fictional)",
    "sections": [
        ("1 Scope",
         "This fictional procedure covers first-line operation and servicing of the "
         "FGS-12 field generator set used by demonstration units. It exists solely "
         "to exercise document ingestion during testing."),
        ("2.1 Start-Up Sequence",
         "Confirm the fuel isolation valve is open. Prime the lift pump with twelve "
         "strokes. Set the load selector to OFF and crank for no longer than fifteen "
         "seconds. Once running, allow the set to stabilise for four minutes before "
         "applying load."),
        ("2.4 Operating Limits",
         "The continuous rated output of the FGS-12 is 12.5 kVA at 50 Hz. Do not "
         "exceed 14 kVA even briefly. Coolant temperature must remain below 96 "
         "degrees Celsius; shut the set down if it is exceeded."),
        ("3.2 Scheduled Servicing",
         "Change the lubricating oil every 250 running hours using grade OMD-90. "
         "Replace air filter element AF-771 every 500 running hours, or sooner in "
         "dusty conditions. Record every service in the set log book."),
        ("4.1 Fault — Output Voltage Low",
         "If output falls below 210 V on load, check the automatic voltage regulator "
         "fuse first. If the fuse is intact, replace regulator module AVR-30 and "
         "re-test on a half load for ten minutes before returning the set to use."),
    ],
}

CONFIDENTIAL = {
    "filename": "TEST-CONF-450.pdf",
    "banner": "CONFIDENTIAL — FOR DEMONSTRATION ONLY",
    "title": "Forward Fuel Reserve Disposition — Exercise KESTREL (Fictional)",
    "sections": [
        ("1 Purpose",
         "This fictional document records the disposition of forward fuel reserves "
         "for demonstration Exercise KESTREL. It is marked confidential purely to "
         "test access control; nothing in it is real."),
        ("2.1 Reserve Holdings",
         "The forward reserve at demonstration site BRAVO holds 84,000 litres of "
         "diesel and 6,200 litres of aviation fuel. The reserve at site DELTA holds "
         "41,500 litres of diesel only."),
        ("2.3 Replenishment Trigger",
         "Replenishment is initiated when the diesel holding at any forward site "
         "falls below 30 per cent of its authorised level. For site BRAVO this "
         "trigger point is 25,200 litres."),
        ("3.1 Convoy Routing",
         "Resupply convoys for Exercise KESTREL route via the fictional CHARLIE "
         "corridor with a scheduled turnaround of 26 hours. The alternate route "
         "adds 9 hours and is used only when the primary corridor is closed."),
        ("4.2 Authorising Officer",
         "Release of the forward reserve requires the authority of the exercise "
         "logistics officer, appointment code LOG-KES-02. No release may be made on "
         "verbal instruction alone."),
    ],
}


def build(spec: dict) -> Path:
    path = OUT / spec["filename"]
    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=10.5, leading=15)
    heading = ParagraphStyle("heading", parent=styles["Heading2"], fontSize=12,
                             spaceBefore=10, spaceAfter=4)

    def chrome(canvas, doc):
        if not spec["banner"]:
            return
        canvas.saveState()
        canvas.setFont("Helvetica-Bold", 8)
        width, height = A4
        for y in (height - 12 * mm, 8 * mm):
            canvas.setFillColorRGB(0.45, 0.08, 0.10)
            canvas.rect(0, y, width, 8 * mm, fill=1, stroke=0)
            canvas.setFillColorRGB(1, 1, 1)
            canvas.drawCentredString(width / 2, y + 2.4 * mm, spec["banner"])
        canvas.restoreState()

    doc = BaseDocTemplate(str(path), pagesize=A4, topMargin=24 * mm,
                          bottomMargin=22 * mm, title=spec["title"])
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=chrome)])

    flow = [Paragraph(spec["title"], styles["Title"]), Spacer(1, 5 * mm)]
    for title, text in spec["sections"]:
        flow.append(Paragraph(title, heading))
        flow.append(Paragraph(text, body))
    doc.build(flow)
    return path


if __name__ == "__main__":
    for spec in (STANDARD, CONFIDENTIAL):
        written = build(spec)
        print(f"wrote {written}  ({written.stat().st_size:,} bytes)")
