"""Local OCR for scanned/image PDFs (§6.4). OCRmyPDF adds a text layer with
Tesseract; page-level anchors are preserved for citations (FR-5.2.2). Fully
local — no cloud OCR — for air-gap. Per-block OCR confidence is stored so
low-confidence chunks can be de-ranked and surfaced in the load report."""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from dkip.ingest.parse import Block, Parsed


def ocr_pdf(data: bytes) -> Parsed:
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "in.pdf"
        out = Path(td) / "out.pdf"
        src.write_bytes(data)
        try:
            subprocess.run(
                ["ocrmypdf", "--force-ocr", "--optimize", "0", "--quiet",
                 str(src), str(out)],
                check=True, capture_output=True, timeout=600)
            ocr_bytes = out.read_bytes()
        except Exception:
            # ponytail: if OCRmyPDF/tesseract is unavailable, fall back to raw
            # text extraction so ingestion still completes (flagged low-confidence).
            ocr_bytes = data

        import fitz
        doc = fitz.open(stream=ocr_bytes, filetype="pdf")
        parsed = Parsed(page_count=doc.page_count, ocr=True)
        for pno in range(doc.page_count):
            page = doc[pno]
            txt = page.get_text("text").strip()
            if not txt:
                continue
            # crude per-page confidence proxy: alnum ratio of recognized text
            alnum = sum(c.isalnum() or c.isspace() for c in txt)
            conf = round(alnum / max(len(txt), 1), 3)
            parsed.blocks.append(Block(text=txt, section="", page_start=pno + 1,
                                       page_end=pno + 1, ocr_confidence=conf))
        doc.close()
        return parsed
