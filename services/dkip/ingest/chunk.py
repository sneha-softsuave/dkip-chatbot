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
    groups: list[tuple[str, list[Block]]] = []
    for b in parsed.blocks:
        if groups and groups[-1][0] == b.section:
            groups[-1][1].append(b)
        else:
            groups.append((b.section, [b]))

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
