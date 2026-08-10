"""Generates docs/DKIP-flow.pdf — a three-page flowchart of the system.

Run:  python docs/flow_diagram.py

ponytail: hand-placed coordinates, no layout engine. Three fixed pages don't
need one; if the diagram grows past that, render the HTML version to PDF with
the Playwright already in apps/web instead of growing this.
"""
from __future__ import annotations

import os

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as pdfcanvas

W, H = A4

INK = HexColor("#12161c")
MUTED = HexColor("#6b7480")
LINE = HexColor("#b9c0c9")

AMBER, AMBER_BG = HexColor("#9a6f00"), HexColor("#fdf4d9")
CYAN, CYAN_BG = HexColor("#0d6f85"), HexColor("#ddf2f7")
OK, OK_BG = HexColor("#0a7f52"), HexColor("#ddf3e9")
STOP, STOP_BG = HexColor("#c22f42"), HexColor("#fce3e6")
GREY, GREY_BG = HexColor("#48525e"), HexColor("#f1f3f6")

OPERATOR = (AMBER, AMBER_BG)
ADMIN = (CYAN, CYAN_BG)
GOOD = (OK, OK_BG)
HALT = (STOP, STOP_BG)
PLAIN = (GREY, GREY_BG)


# ---- primitives -------------------------------------------------------------

def box(c, cx, cy, w, h, lines, style=PLAIN, radius=4):
    stroke, fill = style
    c.setLineWidth(1)
    c.setStrokeColor(stroke)
    c.setFillColor(fill)
    c.roundRect(cx - w / 2, cy - h / 2, w, h, radius, stroke=1, fill=1)

    head, *rest = lines
    total = 11 + 9.5 * len(rest)
    y = cy + total / 2 - 9
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawCentredString(cx, y, head)
    c.setFont("Helvetica", 7.2)
    c.setFillColor(MUTED)
    for line in rest:
        y -= 9.5
        c.drawCentredString(cx, y, line)
    return {"cx": cx, "cy": cy, "w": w, "h": h}


def diamond(c, cx, cy, w, h, text):
    c.setLineWidth(1)
    c.setStrokeColor(GREY)
    c.setFillColor(white)
    p = c.beginPath()
    p.moveTo(cx, cy + h / 2)
    p.lineTo(cx + w / 2, cy)
    p.lineTo(cx, cy - h / 2)
    p.lineTo(cx - w / 2, cy)
    p.close()
    c.drawPath(p, stroke=1, fill=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(cx, cy - 2.8, text)
    return {"cx": cx, "cy": cy, "w": w, "h": h}


def _head(c, x, y, up=False):
    """Arrowhead pointing down (or up)."""
    d = 4.5
    p = c.beginPath()
    p.moveTo(x, y)
    p.lineTo(x - 3, y + d if not up else y - d)
    p.lineTo(x + 3, y + d if not up else y - d)
    p.close()
    c.drawPath(p, stroke=0, fill=1)


def arrow(c, src, dst, label=None, dashed=False):
    """Elbow arrow from the bottom of src to the top of dst."""
    x1, y1 = src["cx"], src["cy"] - src["h"] / 2
    x2, y2 = dst["cx"], dst["cy"] + dst["h"] / 2
    c.setStrokeColor(LINE)
    c.setFillColor(LINE)
    c.setLineWidth(1)
    c.setDash(3, 3) if dashed else c.setDash()

    if abs(x1 - x2) < 0.5:
        c.line(x1, y1, x2, y2 + 5)
    else:
        mid = (y1 + y2) / 2
        c.line(x1, y1, x1, mid)
        c.line(x1, mid, x2, mid)
        c.line(x2, mid, x2, y2 + 5)
    c.setDash()
    _head(c, x2, y2)

    if label:
        c.setFont("Helvetica", 6.6)
        c.setFillColor(MUTED)
        ly = (y1 + y2) / 2 + 3 if abs(x1 - x2) >= 0.5 else (y1 + y2) / 2
        c.drawCentredString((x1 + x2) / 2, ly, label)


def loop_back(c, src, dst, label):
    """Left-hand return arrow, src back up into dst. Routed outside both boxes
    so it never crosses whatever sits beside src."""
    x = min(src["cx"] - src["w"] / 2, dst["cx"] - dst["w"] / 2) - 15
    edge = dst["cx"] - dst["w"] / 2
    c.setStrokeColor(LINE)
    c.setFillColor(LINE)
    c.setLineWidth(1)
    c.line(src["cx"] - src["w"] / 2, src["cy"], x, src["cy"])
    c.line(x, src["cy"], x, dst["cy"])
    c.line(x, dst["cy"], edge - 5, dst["cy"])
    p = c.beginPath()
    p.moveTo(edge, dst["cy"])
    p.lineTo(edge - 5, dst["cy"] + 3)
    p.lineTo(edge - 5, dst["cy"] - 3)
    p.close()
    c.drawPath(p, stroke=0, fill=1)
    c.saveState()
    c.translate(x - 4, (src["cy"] + dst["cy"]) / 2)
    c.rotate(90)
    c.setFont("Helvetica", 6.6)
    c.setFillColor(MUTED)
    c.drawCentredString(0, 0, label)
    c.restoreState()


def page_head(c, title, subtitle, page_no):
    c.setStrokeColor(INK)
    c.setLineWidth(1.2)
    c.line(45, H - 62, W - 45, H - 62)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(45, H - 52, title)
    c.setFont("Helvetica", 8.5)
    c.setFillColor(MUTED)
    c.drawString(45, H - 78, subtitle)
    c.setFont("Helvetica", 7)
    c.drawRightString(W - 45, H - 52, f"DKIP  ·  {page_no} of 3")


def legend(c):
    items = [("Operator", AMBER), ("Knowledge admin", CYAN),
             ("Result", OK), ("System declines", STOP)]
    x = 45
    c.setFont("Helvetica", 7)
    for label, colour in items:
        c.setFillColor(colour)
        c.rect(x, 52, 7, 7, stroke=0, fill=1)
        c.setFillColor(MUTED)
        c.drawString(x + 11, 52.6, label)
        x += c.stringWidth(label, "Helvetica", 7) + 34
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Oblique", 6.5)
    c.drawRightString(W - 45, 52.6, "Generated from source · docs/flow_diagram.py")


# ---- pages ------------------------------------------------------------------

def page_journey(c):
    page_head(c, "How the system works", "Sign-in to a cited answer — both roles", 1)
    mid = W / 2

    signin = box(c, mid, 700, 260, 32, ["Sign in", "password or single sign-on"])
    token = box(c, mid, 640, 300, 32,
                ["Token issued", "role  ·  clearance 1-4  ·  organisation"])
    role = diamond(c, mid, 580, 130, 34, "Which role?")

    upload = box(c, 165, 508, 210, 34,
                 ["Upload documents", "set collection and classification"], ADMIN)
    index = box(c, 165, 444, 210, 40,
                ["Read, split and index", "section, page and position kept",
                 "so citations can point back"], ADMIN)
    chat = box(c, 430, 508, 210, 34, ["Open the chat", "one box, plain language"], OPERATOR)

    ask = box(c, mid, 372, 300, 32,
              ["Ask a question, or ask for a report"], OPERATOR)
    intent = diamond(c, mid, 314, 175, 34, "What did they ask for?")

    answer = box(c, 165, 246, 205, 40,
                 ["Answer, every claim cited", "or a clear 'not in your documents'"], GOOD)
    source = box(c, 165, 182, 205, 32,
                 ["Click a citation", "the exact page opens"], OPERATOR)

    plan = box(c, 430, 246, 205, 40,
               ["A plan you edit first", "nothing is written until you approve"], OPERATOR)
    report = box(c, 430, 182, 205, 32,
                 ["Report generated", "revise by asking  ·  export PDF or Word"], GOOD)

    trail = box(c, mid, 112, 400, 34,
                ["Every question, answer and export is recorded",
                 "together with the exact passages used"])

    arrow(c, signin, token)
    arrow(c, token, role)
    arrow(c, role, upload, "knowledge admin")
    arrow(c, role, chat, "everyone")
    arrow(c, upload, index)
    arrow(c, index, ask, "now searchable")
    arrow(c, chat, ask)
    arrow(c, ask, intent)
    arrow(c, intent, answer, "a question")
    arrow(c, intent, plan, "a report")
    arrow(c, answer, source)
    arrow(c, plan, report)
    arrow(c, source, trail)
    arrow(c, report, trail)

    c.setFont("Helvetica-Oblique", 7)
    c.setFillColor(MUTED)
    c.drawCentredString(mid, 82,
                        "clearance 1-4 is applied inside every search, not as a screen filter — "
                        "a document above your level is never retrieved")
    legend(c)


def page_answer(c):
    page_head(c, "How an answer is built", "Two searches, one gate, no guessing", 2)
    mid = W / 2

    q = box(c, mid, 702, 240, 30, ["The question"], OPERATOR)
    rw = box(c, mid, 652, 300, 32,
             ["Fold in the last few turns", "so 'what about that one' resolves"])

    dense = box(c, 168, 586, 200, 38,
                ["Meaning search", "50 passages", "finds it when the wording differs"])
    lex = box(c, 428, 586, 200, 38,
              ["Exact-wording search", "50 passages", "finds part numbers and codes"])

    fuse = box(c, mid, 518, 280, 32, ["Merge the two rankings", "keep the best 40"])
    rr = box(c, mid, 468, 280, 30, ["Re-score each one against the question"])
    top = box(c, mid, 418, 280, 32,
              ["Best 6 passages", "superseded revisions pushed down"])

    gate = diamond(c, mid, 360, 210, 36, "Is the best one good enough?")

    gen = box(c, 430, 294, 200, 32,
              ["Write the answer using", "only those 6 passages"])
    check = diamond(c, 430, 234, 190, 34, "Did it cite its claims?")

    # Both refusal paths land here, below the check, so neither arrow doubles back.
    halt = box(c, 158, 156, 195, 42,
               ["\"I could not find this", "in your documents\"",
                "nothing is invented to fill the gap"], HALT)
    bind = box(c, 430, 160, 200, 34,
               ["Tie each citation back to", "document  ·  section  ·  page"], GOOD)

    out = box(c, mid, 96, 330, 32,
              ["Answer with clickable sources and a confidence score"], GOOD)

    arrow(c, q, rw)
    arrow(c, rw, dense, "filtered by clearance")
    arrow(c, rw, lex, "filtered by clearance")
    arrow(c, dense, fuse)
    arrow(c, lex, fuse)
    arrow(c, fuse, rr)
    arrow(c, rr, top)
    arrow(c, top, gate)
    arrow(c, gate, halt, "no")
    arrow(c, gate, gen, "yes")
    arrow(c, gen, check)
    arrow(c, check, bind, "yes")
    arrow(c, check, halt, "no")
    arrow(c, bind, out)
    arrow(c, halt, out)

    c.setFont("Helvetica", 7)
    c.setFillColor(MUTED)
    c.drawCentredString(mid, 68,
                        "50 + 50 candidates  ->  40 merged  ->  6 used  ·  below a 0.15 score it declines to answer")
    legend(c)


def page_report(c):
    page_head(c, "How a report is built", "Planned first, written second, revised by talking", 3)
    mid = W / 2

    ask = box(c, mid, 700, 260, 30, ["\"Write me a report on ...\""], OPERATOR)
    ev = box(c, mid, 648, 320, 32,
             ["Search for evidence only", "nothing is written yet"])
    plan = box(c, mid, 588, 340, 40,
               ["Propose a title, 3-5 sections,",
                "and 3 questions - sources, chart, depth",
                "each already set to a sensible default"])
    edit = box(c, mid, 524, 300, 34,
               ["You adjust the plan", "rename  ·  reorder  ·  remove  ·  add"], OPERATOR)
    gen = box(c, mid, 468, 200, 28, ["Generate"], OPERATOR)
    secs = box(c, mid, 412, 340, 32,
               ["Each section written on its own", "its own search, its own citations"])

    chart = diamond(c, mid, 352, 160, 34, "Chart wanted?")

    c1 = box(c, 130, 282, 155, 40, ["From equipment", "records", "numbers are facts"])
    c2 = box(c, mid, 282, 165, 40,
             ["Figures from the text", "checked word for word", "against the source"])
    c3 = box(c, 465, 282, 155, 40, ["Cited table", "of figures", "when nothing else is safe"])

    saved = box(c, mid, 202, 300, 32,
                ["Report saved into the conversation"], GOOD)

    revise = box(c, 172, 132, 200, 40,
                 ["Ask for a change", "the section is re-written from a fresh search,",
                  "never edited in place"], OPERATOR)
    export = box(c, 430, 132, 200, 40,
                 ["Export PDF or Word", "classification banner",
                  "and a full source list"], GOOD)

    arrow(c, ask, ev)
    arrow(c, ev, plan)
    arrow(c, plan, edit)
    arrow(c, edit, gen)
    arrow(c, gen, secs)
    arrow(c, secs, chart)
    arrow(c, chart, c1)
    arrow(c, chart, c2)
    arrow(c, chart, c3)
    arrow(c, c1, saved)
    arrow(c, c2, saved)
    arrow(c, c3, saved)
    arrow(c, saved, revise)
    arrow(c, saved, export)
    loop_back(c, revise, saved, "updated in place")

    c.setFont("Helvetica", 7)
    c.setFillColor(MUTED)
    c.drawCentredString(mid, 88, "citations are re-bound on every rewrite, so they never drift off the sentences they support")
    legend(c)


def build(path: str) -> str:
    c = pdfcanvas.Canvas(path, pagesize=A4)
    c.setTitle("DKIP — system flow")
    for page in (page_journey, page_answer, page_report):
        page(c)
        c.showPage()
    c.save()
    return path


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "DKIP-flow.pdf")
    build(out)
    assert os.path.getsize(out) > 5000, "PDF looks empty"
    print(f"wrote {out} ({os.path.getsize(out) // 1024} KB)")
