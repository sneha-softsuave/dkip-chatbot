"""Generate the fictional demo corpus (PRD §7: realistic but entirely fictional,
Indian-Army / Corps of EME styling). Produces real multi-page PDFs (so page
anchors exist), a scanned-style image PDF (to prove OCR), text SOPs, and a
fleet CSV that backs the structured/dashboard demo. Returns an ingest manifest.

All content is invented for demonstration. Nothing here is real doctrine."""
from __future__ import annotations

import csv
import io
import os
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate,
                                Paragraph, Spacer)

BANNER = "UNCLASSIFIED // FOR DEMONSTRATION"


def _pdf(path: Path, title: str, sections: list[tuple[str, str]]) -> int:
    styles = getSampleStyleSheet()
    buf = io.BytesIO()

    def chrome(canvas, doc):
        canvas.saveState()
        w, h = A4
        canvas.setFont("Helvetica-Bold", 7)
        for y in (h - 10 * mm, 6 * mm):
            canvas.setFillColorRGB(0.09, 0.30, 0.17)
            canvas.rect(0, y, w, 6 * mm, fill=1, stroke=0)
            canvas.setFillColorRGB(1, 1, 1)
            canvas.drawCentredString(w / 2, y + 1.7 * mm, BANNER)
        canvas.restoreState()

    doc = BaseDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=16 * mm)
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height)
    doc.addPageTemplates([PageTemplate(id="m", frames=[frame], onPage=chrome)])
    flow = [Paragraph(title, styles["Title"]), Spacer(1, 4 * mm)]
    for head, body in sections:
        flow.append(Paragraph(head, styles["Heading2"]))
        flow.append(Paragraph(body.replace("\n", "<br/>"), styles["BodyText"]))
        flow.append(Spacer(1, 3 * mm))
    doc.build(flow)
    data = buf.getvalue()
    path.write_bytes(data)
    import fitz
    d = fitz.open(stream=data, filetype="pdf")
    n = d.page_count
    d.close()
    return n


def _scanned_pdf(path: Path, title: str, lines: list[str]) -> None:
    """Render text to an image and wrap as an image-only PDF -> forces OCR."""
    import fitz
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    # draw as a pixmap-only page by inserting text then rasterizing
    tmp = fitz.open()
    p = tmp.new_page(width=595, height=842)
    p.insert_text((50, 60), title, fontsize=16, fontname="helv")
    y = 100
    for ln in lines:
        p.insert_text((50, y), ln, fontsize=11, fontname="helv")
        y += 22
    pix = p.get_pixmap(dpi=150)
    page.insert_image(page.rect, pixmap=pix)  # image only -> no text layer
    doc.save(str(path))
    doc.close(); tmp.close()


def generate(root: str) -> list[dict]:
    corpus = Path(root) / "corpus"
    corpus.mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []

    def add(fn, code, title, coll, dtype, cls, clr, unit, rev):
        manifest.append({"filename": fn, "doc_code": code, "title": title,
                         "collection": coll, "doc_type": dtype,
                         "classification": cls, "clearance_required": clr,
                         "unit": unit, "revision": rev})

    # 1) Operator manual — recovery vehicle (multi-page, cited procedures)
    _pdf(corpus / "OM-VEH-001.pdf",
         "Operator Manual — 5-Tonne Recovery Vehicle (Fictional Type ARV-5)",
         [("1 Introduction",
           "This manual covers operation and first-line maintenance of the "
           "fictional ARV-5 5-tonne recovery vehicle used for demonstration. "
           "Nomenclature code ARV-5; NSN 2530-99-000-0001 (fictional)."),
          ("4.3 Corrective Action — Hydraulic Pressure Loss",
           "On indication of hydraulic under-pressure (main gauge below 140 bar): "
           "1) Halt recovery operation and lower the boom to rest. "
           "2) Inspect the primary hydraulic circuit for external leakage at the "
           "pump coupling and the boom ram seals. "
           "3) Check reservoir level; top up with grade OM-15 fluid if below the "
           "MIN line. "
           "4) If pressure does not recover to 150 bar within two minutes, isolate "
           "the pump and raise a first-line maintenance demand. Do not resume "
           "recovery until pressure is restored."),
          ("4.4 Winch Operation Limits",
           "Maximum line pull is 9,000 kgf on a single part of line. Never exceed "
           "the rated pull; use a snatch block to double the line for heavier "
           "casualties. Keep personnel clear of the bight."),
          ("6.1 Periodic Servicing",
           "Perform Level-1 servicing every 250 km or 30 days, whichever is "
           "sooner. Record all servicing in the vehicle log book.")],
         )
    add("OM-VEH-001.pdf", "OM-VEH-001",
        "Operator Manual — 5-Tonne Recovery Vehicle (ARV-5)", "veh-recovery",
        "manual", "UNCLASSIFIED", 1, "12 Corps", "B")

    # 2) Hydraulic SOP
    _pdf(corpus / "SOP-HYD-014.pdf",
         "SOP — Hydraulic System Inspection (Fictional)",
         [("2 Scope", "Standing procedure for scheduled inspection of vehicle "
           "hydraulic systems in fictional demonstration fleets."),
          ("3.2 Remedial Action on Under-Pressure",
           "Where a hydraulic circuit reads below its rated working pressure, "
           "the remedial action is to bleed the circuit, replace the return-line "
           "filter element, and re-test at rated load. Log the filter part number "
           "HF-2205 against the vehicle."),
          ("3.5 Seal Replacement",
           "Ram seals showing weepage exceeding one drop per minute at rest shall "
           "be replaced at first-line. Torque the gland nut to 90 N·m.")],
         )
    add("SOP-HYD-014.pdf", "SOP-HYD-014", "SOP — Hydraulic System Inspection",
        "hydraulics", "sop", "UNCLASSIFIED", 1, "12 Corps", "A")

    # 3) Inspection record
    _pdf(corpus / "INS-REC-2207.pdf",
         "Inspection Record — Recovery Fleet Q2 (Fictional)",
         [("Summary", "Quarterly inspection of the fictional recovery fleet in "
           "12 Corps. 18 vehicles inspected; 14 serviceable, 3 unserviceable, "
           "1 awaiting spares."),
          ("Defects Noted", "Two ARV-5 vehicles showed hydraulic under-pressure "
           "traced to worn return-line filters (HF-2205). One winch brake "
           "adjustment out of tolerance. All raised as first-line demands."),
          ("Recommendation", "Increase filter HF-2205 stock holding; schedule "
           "winch brake calibration across the fleet.")],
         )
    add("INS-REC-2207.pdf", "INS-REC-2207", "Inspection Record — Recovery Fleet Q2",
        "veh-recovery", "record", "UNCLASSIFIED", 1, "12 Corps", "A")

    # 4) Restricted engineering note (clearance 2 — for the RBAC demo)
    _pdf(corpus / "ENG-NOTE-880.pdf",
         "Engineering Note — Boom Weld Advisory (Fictional, RESTRICTED)",
         [("Advisory", "A fictional advisory: inspect ARV-5 boom heel welds for "
           "hairline cracking after 5,000 recovery cycles. This document is "
           "marked RESTRICTED for the clearance demonstration."),
          ("Action", "Dye-penetrant test the heel weld; if indication exceeds "
           "3 mm, withdraw the vehicle and raise a second-line demand.")],
         )
    add("ENG-NOTE-880.pdf", "ENG-NOTE-880",
        "Engineering Note — Boom Weld Advisory", "veh-recovery", "engineering",
        "RESTRICTED", 2, "12 Corps", "A")

    # 5) Superseded revision (for the revision/superseded UI badge)
    _pdf(corpus / "OM-VEH-001-revA.pdf",
         "Operator Manual — 5-Tonne Recovery Vehicle (ARV-5) [Revision A — superseded]",
         [("4.3 Corrective Action — Hydraulic Pressure Loss (Rev A)",
           "SUPERSEDED. Older revision: top up reservoir and resume operation. "
           "This guidance was replaced by Revision B, which requires isolating the "
           "pump if pressure does not recover.")],
         )
    add("OM-VEH-001-revA.pdf", "OM-VEH-001",
        "Operator Manual — ARV-5 (Revision A, superseded)", "veh-recovery",
        "manual", "UNCLASSIFIED", 1, "12 Corps", "A")

    # 6) Scanned (image-only) PDF -> OCR path
    _scanned_pdf(corpus / "SCAN-LOG-4471.pdf",
                 "Field Maintenance Log 4471 (Scanned, Fictional)",
                 ["Date: 14 Mar  Vehicle: ARV-5 #07",
                  "Fault: hydraulic pressure low, gauge 120 bar.",
                  "Action: replaced return-line filter HF-2205, bled circuit.",
                  "Re-test: 152 bar at rated load. Serviceable.",
                  "Signed: Cfn S. Singh"])
    add("SCAN-LOG-4471.pdf", "SCAN-LOG-4471", "Field Maintenance Log 4471 (Scanned)",
        "veh-recovery", "record", "UNCLASSIFIED", 1, "12 Corps", "A")

    # 7) Plain-text SOP
    (corpus / "SOP-SPARES-props.txt").write_text(
        "1 SCOPE\nStock policy for fictional recovery-fleet spares.\n\n"
        "2.1 FILTER HOLDING\nMaintain minimum 20 units of hydraulic return-line "
        "filter HF-2205 at first-line. Reorder at 8 units.\n\n"
        "2.2 SEAL KITS\nHold 10 boom-ram seal kits SK-ARV5 per unit.\n",
        encoding="utf-8")
    add("SOP-SPARES-props.txt", "SOP-SPARES-01", "SOP — Recovery Fleet Spares Policy",
        "logistics", "sop", "UNCLASSIFIED", 1, "12 Corps", "A")

    # 8) Fleet status CSV -> structured table + dashboard
    fleet = corpus / "fleet_status.csv"
    with fleet.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["unit", "equipment", "variant", "total", "serviceable",
                    "unserviceable", "awaiting_spares"])
        rows = [
            ("12 Corps", "Recovery Vehicle", "5-tonne", 18, 14, 3, 1),
            ("12 Corps", "Recovery Vehicle", "10-tonne", 8, 6, 2, 0),
            ("12 Corps", "Crane", "Field", 5, 4, 1, 0),
            ("4 Corps", "Recovery Vehicle", "5-tonne", 12, 9, 2, 1),
            ("4 Corps", "Recovery Vehicle", "10-tonne", 6, 5, 1, 0),
            ("4 Corps", "Crane", "Field", 4, 3, 1, 0),
        ]
        w.writerows(rows)

    return manifest


if __name__ == "__main__":
    m = generate(os.getenv("DATA_DIR", "/data"))
    print(f"generated {len(m)} documents + fleet_status.csv")
