"""Generates the five test-upload PDFs in docs/testdata/.

Run:  python docs/testdata/make_test_docs.py

Every fact in these documents is fictional and every figure is deliberately
distinctive, so a prompt can be checked against one exact answer. Two of the
files carry **canary facts** — figures that appear in no other document in the
corpus. A Standard-clearance account asking for a canary fact must abstain; a
Full-clearance account must answer and cite. That contrast is the whole point of
the confidential pair, so do not repeat those figures anywhere else.

ponytail: reportlab straight to canvas, same as docs/flow_diagram.py. Five
fixed documents don't need a template engine.
"""
from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as pdfcanvas

W, H = A4
OUT = Path(__file__).parent

INK = HexColor("#111111")
MUTED = HexColor("#555555")
STAMP = HexColor("#b3261e")

MARGIN = 56
LEADING = 15


def _wrap(c: pdfcanvas.Canvas, text: str, width: float, font: str, size: float) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if c.stringWidth(trial, font, size) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def build(path: Path, *, doc_code: str, title: str, classification: str,
          unit: str, revision: str, sections: list[tuple[str, str]]) -> None:
    c = pdfcanvas.Canvas(str(path), pagesize=A4)
    y = H - MARGIN

    def newpage():
        nonlocal y
        c.showPage()
        y = H - MARGIN

    def need(space: float):
        nonlocal y
        if y - space < MARGIN + 30:
            newpage()

    # Header block — the metadata a citation points back at.
    c.setFont("Helvetica-Bold", 15)
    c.setFillColor(INK)
    for line in _wrap(c, title, W - 2 * MARGIN, "Helvetica-Bold", 15):
        c.drawString(MARGIN, y, line)
        y -= 19
    y -= 4
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawString(MARGIN, y, f"Reference {doc_code}    Revision {revision}    Unit: {unit}")
    y -= 14
    if classification != "UNCLASSIFIED":
        c.setFillColor(STAMP)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(MARGIN, y, f"{classification} — handling restricted")
        y -= 16
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(MARGIN, y, "FICTIONAL CONTENT — generated for platform testing only.")
    y -= 22

    for heading, body in sections:
        need(70)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(MARGIN, y, heading)
        y -= LEADING + 3
        c.setFont("Helvetica", 10)
        for line in _wrap(c, body, W - 2 * MARGIN, "Helvetica", 10):
            need(LEADING)
            c.drawString(MARGIN, y, line)
            y -= LEADING
        y -= 9

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(MARGIN, MARGIN - 18, f"{doc_code} · {classification} · fictional test document")
    c.save()
    print(f"  {path.name}  [{classification}]")


# ── UNCLASSIFIED — upload as "Standard — everyone" ─────────────────────────────

UNCLASSIFIED_DOCS = [
    dict(
        path=OUT / "TM-GEN-220.pdf", doc_code="TM-GEN-220",
        title="Technical Manual — ARV-5 Winch and Rigging Equipment",
        classification="UNCLASSIFIED", unit="12 Field Workshop", revision="B",
        sections=[
            ("1 Scope",
             "This manual covers the main recovery winch, rope, and rigging accessories "
             "fitted to the fictional ARV-5 5-tonne recovery vehicle. It supplements the "
             "operator manual and does not replace first-line servicing schedules."),
            ("3.2 Winch Rope Specification",
             "The main winch rope is 28 mm diameter, 6x36 construction with an "
             "independent wire rope core (IWRC). Nominal breaking load is 52,000 kgf. "
             "The rope shall be withdrawn from service and discarded when 10 or more "
             "broken wires are found within one lay length, or when any single strand "
             "is severed, whichever occurs first."),
            ("3.5 Rope Inspection Interval",
             "Visually inspect the full working length of rope every 25 recovery "
             "operations, or every 90 days, whichever falls sooner. Record each "
             "inspection on form REC-14 and retain for 24 months."),
            ("5.1 Snatch Block",
             "The issued snatch block has a safe working load of 16,000 kgf. Doubling "
             "the line through a snatch block halves the load on the rope and permits "
             "recovery of casualties up to the vehicle's rated capacity. The block shall "
             "not be used with rope showing any deformation of the outer strands."),
            ("5.4 Shackle and Strop Marking",
             "All shackles shall carry a legible SWL stamp. Any shackle whose marking "
             "cannot be read shall be withdrawn. Recovery strops are colour-coded: blue "
             "for 8,000 kgf, green for 12,000 kgf, and red for 20,000 kgf."),
            ("7.2 Prohibited Practices",
             "Do not use the recovery winch as a lifting appliance. Do not stand within "
             "1.5 times the rope length of a rope under tension. Do not join two ropes "
             "with a bow shackle under load."),
        ],
    ),
    dict(
        path=OUT / "SOP-BRK-031.pdf", doc_code="SOP-BRK-031",
        title="Standard Operating Procedure — ARV-5 Brake System Inspection",
        classification="UNCLASSIFIED", unit="12 Field Workshop", revision="A",
        sections=[
            ("1 Purpose",
             "To define the first-line brake system inspection for the fictional ARV-5 "
             "recovery vehicle, carried out before any recovery task and at scheduled "
             "servicing."),
            ("2.4 Wheel Nut Torque",
             "Wheel nuts shall be tightened to 620 Nm in a diagonal sequence. Re-check "
             "the torque after the first 50 km following any wheel removal, and again at "
             "the next scheduled service."),
            ("3.1 Air Pressure Check",
             "With the engine at idle, system air pressure shall build to 8.2 bar within "
             "four minutes. A build time exceeding four minutes indicates compressor "
             "wear and shall be raised as a second-line demand."),
            ("4.1 Brake Fluid",
             "The braking system uses DOT-4 fluid. Fluid shall be replaced every 24 "
             "months regardless of mileage, and always after any hydraulic component "
             "has been opened to atmosphere."),
            ("4.6 Pad Wear Limit",
             "Friction material shall be replaced when the remaining thickness reaches "
             "4.5 mm at any point across the pad. Pads worn unevenly by more than 2 mm "
             "across their width indicate caliper misalignment and require investigation."),
            ("6.1 Deferral",
             "A brake defect may not be deferred. Any vehicle failing this inspection is "
             "declared non-task-worthy and immobilised until rectified."),
        ],
    ),
    dict(
        path=OUT / "INS-REC-2301.pdf", doc_code="INS-REC-2301",
        title="Inspection Record — Recovery Fleet, Third Quarter",
        classification="UNCLASSIFIED", unit="12 Field Workshop", revision="A",
        sections=[
            ("1 Inspection Window",
             "Inspections were carried out between 12 and 23 August. A total of 14 "
             "recovery vehicles were presented, of which 14 were inspected and none "
             "were withdrawn before inspection."),
            ("2 Outcome Summary",
             "Of the 14 vehicles inspected, 9 passed with no defects, 3 passed with "
             "deferred minor defects, and 2 failed and were immobilised. The two "
             "failures were both attributed to brake system faults under SOP-BRK-031."),
            ("3 Deferred Defects",
             "The 3 deferred defects comprised: one cracked mirror arm, one "
             "unserviceable cab heater, and one worn tow-pin retaining clip. All three "
             "are scheduled for rectification at the next scheduled service."),
            ("4 Rope Findings",
             "Two vehicles were found with winch rope approaching the discard criterion "
             "of TM-GEN-220. Both ropes were replaced during the inspection window and "
             "the old ropes destroyed."),
            ("5 Next Inspection",
             "The next quarterly inspection is scheduled for the window 11 to 22 "
             "November. Vehicles carrying deferred defects will be presented first."),
        ],
    ),
]

# ── CONFIDENTIAL — upload as "Confidential — full access only" ────────────────
# Each of these carries at least one canary fact that appears in no other
# document. Those are what prove clearance filtering actually works.

CONFIDENTIAL_DOCS = [
    dict(
        path=OUT / "OPORD-CONF-114.pdf", doc_code="OPORD-CONF-114",
        title="Operational Readiness Assessment — Eastern Sector",
        classification="CONFIDENTIAL", unit="HQ Demonstration Command", revision="A",
        sections=[
            ("1 Purpose",
             "To record the recovery-capability readiness of the Eastern Sector against "
             "the establishment requirement, for command decision. All figures in this "
             "assessment are fictional."),
            ("2.1 Readiness Against Requirement",
             "Overall recovery readiness in the Eastern Sector stands at 68 percent "
             "against a required baseline of 85 percent. This is the lowest figure "
             "recorded across the four sectors in this reporting period."),
            ("3.4 Equipment Shortfall",
             "The assessed shortfall is 11 recovery vehicles across 12 Field Workshop "
             "and its two forward detachments. Of these, 7 are attributable to vehicles "
             "held awaiting spares beyond 90 days."),
            ("4.2 Limiting Factor",
             "The principal limiting factor is recovery crew availability rather than "
             "vehicle holdings. Only 23 qualified recovery mechanics are held against an "
             "establishment of 34."),
            ("5.1 Recommendation",
             "Recommend a temporary cross-attachment of 4 recovery vehicles from the "
             "Central Sector reserve for a period of 90 days, reviewed monthly."),
            ("6 Handling",
             "This assessment is CONFIDENTIAL. It is releasable to full-access holders "
             "only and shall not be quoted in unclassified correspondence."),
        ],
    ),
    dict(
        path=OUT / "ENG-CONF-905.pdf", doc_code="ENG-CONF-905",
        title="Engineering Assessment — Recovery Boom Weld Defect (Confidential)",
        classification="CONFIDENTIAL", unit="Engineering Branch", revision="A",
        sections=[
            ("1.2 Defect Rate",
             "Non-destructive testing of the recovery boom heel weld identified a defect "
             "rate of 4.7 percent across manufacturing batch LOT-2291. The defects are "
             "sub-surface lack-of-fusion indications at the heel-to-pedestal joint."),
            ("2.3 Interim Operating Restriction",
             "Pending completion of re-inspection, an embargo is placed on all boom "
             "lifts exceeding 6,500 kgf on vehicles drawn from batch LOT-2291. Recovery "
             "by winch is unaffected by this embargo."),
            ("3.1 Affected Population",
             "Batch LOT-2291 comprises 46 boom assemblies, of which 31 are known to be "
             "in service. The remaining 15 are held in the spares pipeline and have been "
             "quarantined pending inspection."),
            ("4.4 Re-inspection Schedule",
             "All in-service assemblies from the affected batch shall be re-inspected by "
             "ultrasonic method within 120 days. Assemblies passing re-inspection are "
             "released from the embargo without further restriction."),
            ("5.2 Root Cause",
             "Root cause is assessed as an out-of-tolerance pre-heat temperature during "
             "manufacture, below the specified 120 degrees Celsius minimum. The "
             "manufacturing process has since been corrected."),
            ("6 Handling",
             "CONFIDENTIAL. Not for release to standard-access holders."),
        ],
    ),
]


def main() -> None:
    print("Unclassified — upload as 'Standard — everyone':")
    for spec in UNCLASSIFIED_DOCS:
        build(**spec)
    print("Confidential — upload as 'Confidential — full access only':")
    for spec in CONFIDENTIAL_DOCS:
        build(**spec)
    print(f"\nWritten to {OUT}")


if __name__ == "__main__":
    main()
