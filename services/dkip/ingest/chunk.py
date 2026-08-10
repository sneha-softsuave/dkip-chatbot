"""Structure-aware chunking (§5.1, 4.2.1). Splits prefer section boundaries and
never merge across sections; a ~word budget approximates the token target with
overlap so an answer-bearing sentence is never cut across a boundary. Each
chunk keeps the anchors that resolve a citation to the exact source location."""
from __future__ import annotations

from dataclasses import dataclass

from dkip.core.config import settings
from dkip.ingest.parse import Block, Parsed


@dataclass
class Chunk:
    text: str
    ordinal: int
    section: str
    page_start: int
    page_end: int
    char_start: int
    char_end: int
    bbox: dict | None
    ocr_confidence: float | None


def _budget_words() -> int:
    return max(80, int(settings.CHUNK_TOKENS / 1.33))


def chunk_parsed(parsed: Parsed) -> list[Chunk]:
    budget = _budget_words()
    overlap_words = int(budget * settings.CHUNK_OVERLAP)
    chunks: list[Chunk] = []
    ordinal = 0
    char_cursor = 0

    # Group consecutive blocks by section, then window within a section.
    #
    # A file with no detected headings has no section boundaries to split on, so
    # the whole thing becomes one run and the windows below straddle unrelated
    # material: a three-page flowchart PDF collapsed into a single chunk holding
    # all three diagrams, which the reranker then scored near zero against any
    # specific question — the passage was indexed but never retrievable. Where
    # there are no headings the page *is* the structure, so fall back to it.
    # Documents that do have headings keep the old behaviour, and a paragraph
    # may still span a page break as it should.
    groups: list[tuple[str, list[Block]]] = []
    last_key: tuple | None = None
    for b in parsed.blocks:
        key = (b.section, None if b.section else b.page_start)
        if groups and last_key == key:
            groups[-1][1].append(b)
        else:
            groups.append((b.section, [b]))
        last_key = key

    for section, blocks in groups:
        words: list[str] = []
        meta: list[Block] = []  # parallel: which block each word came from
        for b in blocks:
            bw = b.text.split()
            words.extend(bw)
            meta.extend([b] * len(bw))

        i = 0
        while i < len(words):
            window = words[i:i + budget]
            wmeta = meta[i:i + budget]
            if not window:
                break
            text = " ".join(window)
            pages = [m.page_start for m in wmeta]
            confs = [m.ocr_confidence for m in wmeta if m.ocr_confidence is not None]
            chunks.append(Chunk(
                text=text, ordinal=ordinal, section=section,
                page_start=min(pages), page_end=max(pages),
                char_start=char_cursor, char_end=char_cursor + len(text),
                bbox=wmeta[0].bbox,
                ocr_confidence=round(sum(confs) / len(confs), 3) if confs else None))
            ordinal += 1
            char_cursor += len(text)
            if i + budget >= len(words):
                break
            i += budget - overlap_words
    return chunks
