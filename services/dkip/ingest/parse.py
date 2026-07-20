"""Parse each supported file type into normalized blocks that carry the
anchors a citation resolves back to: section, page, char span, bbox (§6.3).
Scanned/image PDFs get an OCR text layer first (§6.4, FR-5.2.2)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class Block:
    text: str
    section: str = ""
    page_start: int = 1
    page_end: int = 1
    bbox: dict | None = None
    ocr_confidence: float | None = None


@dataclass
class Parsed:
    blocks: list[Block] = field(default_factory=list)
    page_count: int = 0
    ocr: bool = False


_SECTION_RE = re.compile(r"^\s*(\d+(?:\.\d+)*)\s+([A-Z].{2,80})$")


def _looks_like_heading(line: str) -> str | None:
    m = _SECTION_RE.match(line.strip())
    if m:
        return f"{m.group(1)} {m.group(2).strip()}"
    if line.isupper() and 3 < len(line.strip()) < 60:
        return line.strip().title()
    return None


def parse_pdf(data: bytes) -> Parsed:
    import fitz  # PyMuPDF

    doc = fitz.open(stream=data, filetype="pdf")
    parsed = Parsed(page_count=doc.page_count)
    text_chars = 0
    for pno in range(doc.page_count):
        page = doc[pno]
        section = ""
        for blk in page.get_text("blocks"):
            x0, y0, x1, y1, txt, *_ = blk
            txt = (txt or "").strip()
            if not txt:
                continue
            text_chars += len(txt)
            head = _looks_like_heading(txt.splitlines()[0]) if txt else None
            if head and len(txt) < 90:
                section = head
                continue
            parsed.blocks.append(Block(text=txt, section=section,
                                       page_start=pno + 1, page_end=pno + 1,
                                       bbox={"x0": x0, "y0": y0, "x1": x1, "y1": y1}))
    doc.close()
    # No extractable text -> scanned/image PDF -> OCR (§6.4)
    if text_chars < 40 * max(parsed.page_count, 1):
        from dkip.ingest.ocr import ocr_pdf
        return ocr_pdf(data)
    return parsed


def parse_docx(data: bytes) -> Parsed:
    import io

    from docx import Document

    doc = Document(io.BytesIO(data))
    parsed = Parsed(page_count=1)
    section = ""
    for p in doc.paragraphs:
        t = p.text.strip()
        if not t:
            continue
        if p.style and p.style.name and p.style.name.lower().startswith("heading"):
            section = t
            continue
        parsed.blocks.append(Block(text=t, section=section))
    return parsed


def parse_pptx(data: bytes) -> Parsed:
    import io

    from pptx import Presentation

    prs = Presentation(io.BytesIO(data))
    parsed = Parsed(page_count=len(prs.slides))
    for idx, slide in enumerate(prs.slides, start=1):
        texts = [sh.text.strip() for sh in slide.shapes
                 if sh.has_text_frame and sh.text.strip()]
        if texts:
            parsed.blocks.append(Block(text="\n".join(texts),
                                       section=f"Slide {idx}",
                                       page_start=idx, page_end=idx))
    return parsed


def parse_text(data: bytes) -> Parsed:
    text = data.decode("utf-8", errors="ignore")
    parsed = Parsed(page_count=1)
    section = ""
    buf: list[str] = []
    for line in text.splitlines():
        head = _looks_like_heading(line)
        if head:
            if buf:
                parsed.blocks.append(Block(text="\n".join(buf), section=section))
                buf = []
            section = head
            continue
        if line.strip():
            buf.append(line.strip())
        elif buf:
            parsed.blocks.append(Block(text="\n".join(buf), section=section))
            buf = []
    if buf:
        parsed.blocks.append(Block(text="\n".join(buf), section=section))
    return parsed


def parse_html(data: bytes) -> Parsed:
    try:
        from selectolax.parser import HTMLParser
        tree = HTMLParser(data.decode("utf-8", errors="ignore"))
        for tag in tree.css("script, style"):
            tag.decompose()
        text = tree.body.text(separator="\n") if tree.body else tree.text()
    except Exception:
        text = re.sub(r"<[^>]+>", "\n", data.decode("utf-8", errors="ignore"))
    return parse_text(text.encode())


def parse_xlsx(data: bytes) -> Parsed:
    """Parse XLSX into tabular text blocks, one per sheet (§6.3)."""
    import io

    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(data), data_only=True)
    parsed = Parsed(page_count=len(wb.sheetnames))
    for idx, name in enumerate(wb.sheetnames, start=1):
        ws = wb[name]
        rows: list[str] = []
        for row in ws.iter_rows(values_only=True):
            cells = [str(c) if c is not None else "" for c in row]
            if any(cells):
                rows.append(" | ".join(cells))
        if rows:
            parsed.blocks.append(Block(
                text="\n".join(rows),
                section=f"Sheet: {name}",
                page_start=idx, page_end=idx))
    wb.close()
    return parsed


_DISPATCH = {
    ".pdf": parse_pdf, ".docx": parse_docx, ".pptx": parse_pptx,
    ".xlsx": parse_xlsx, ".xls": parse_xlsx,
    ".txt": parse_text, ".md": parse_text, ".html": parse_html, ".htm": parse_html,
}


def parse(filename: str, data: bytes) -> Parsed:
    ext = "." + filename.rsplit(".", 1)[-1].lower()
    if ext not in _DISPATCH:
        raise ValueError(f"unsupported file type: {ext}")
    return _DISPATCH[ext](data)
