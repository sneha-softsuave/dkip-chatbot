"""One-shot seed job (compose `seed` service). Idempotent: safe to re-run.

Steps: ensure stores + identity -> generate corpus if absent -> load the
fleet_status structured table -> ingest every corpus file synchronously with
its manifest metadata, recording a load report (§6.2, FR-5.2.5)."""
from __future__ import annotations

import csv
import os
import time
from pathlib import Path

from sqlalchemy import select, text

from dkip.api.bootstrap import init_stores, seed_identity
from dkip.core.config import settings
from dkip.db.base import SessionLocal, engine
from dkip.db.models import (Collection, IngestionFile, IngestionJob,
                            Organization, StructuredTable)
from dkip.ingest.pipeline import ingest_document
from dkip.scripts.corpus import generate

_CLASS_LEVEL = {"UNCLASSIFIED": 1, "RESTRICTED": 2, "CONFIDENTIAL": 3, "SECRET": 4}


def _wait_stores(retries: int = 30) -> None:
    for _ in range(retries):
        try:
            init_stores()
            with engine.connect() as c:
                c.execute(text("SELECT 1"))
            return
        except Exception as e:  # noqa: BLE001
            print(f"[seed] waiting for stores: {e}")
            time.sleep(3)
    init_stores()


def _load_fleet(db, org_id: str, csv_path: Path) -> None:
    db.execute(text(
        "CREATE TABLE IF NOT EXISTS fleet_status ("
        "unit text, equipment text, variant text, total int, serviceable int, "
        "unserviceable int, awaiting_spares int)"))
    count = db.execute(text("SELECT count(*) FROM fleet_status")).scalar()
    if count and count > 0:
        db.commit(); return
    with csv_path.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            db.execute(text(
                "INSERT INTO fleet_status VALUES (:unit,:equipment,:variant,"
                ":total,:serviceable,:unserviceable,:awaiting_spares)"),
                {**r, "total": int(r["total"]), "serviceable": int(r["serviceable"]),
                 "unserviceable": int(r["unserviceable"]),
                 "awaiting_spares": int(r["awaiting_spares"])})
    if not db.execute(select(StructuredTable).where(StructuredTable.name == "fleet_status")
                      ).scalar_one_or_none():
        db.add(StructuredTable(org_id=org_id, name="fleet_status",
                               physical_table="fleet_status", source="upload",
                               schema_catalog={"columns": ["unit", "equipment",
                               "variant", "total", "serviceable", "unserviceable",
                               "awaiting_spares"]}))
    db.commit()
    print("[seed] fleet_status loaded")


def main() -> None:
    _wait_stores()
    seed_identity()
    data_dir = os.getenv("DATA_DIR", "/data")
    corpus_dir = Path(data_dir) / "corpus"
    manifest = generate(data_dir)  # idempotent; regenerates only missing files

    db = SessionLocal()
    try:
        org = db.execute(select(Organization)).scalars().first()
        colls = {c.slug: c.id for c in db.execute(select(Collection)).scalars().all()}
        _load_fleet(db, org.id, corpus_dir / "fleet_status.csv")

        job = IngestionJob(org_id=org.id, source="upload", trigger="seed")
        db.add(job); db.flush()
        ok = failed = skipped = 0
        for item in manifest:
            path = corpus_dir / item["filename"]
            row = IngestionFile(job_id=job.id, filename=item["filename"], status="pending")
            db.add(row); db.commit()  # durable before risky I/O, so a failure below can't roll it back
            try:
                meta = {"collection_id": colls.get(item["collection"]),
                        "doc_code": item["doc_code"], "title": item["title"],
                        "doc_type": item["doc_type"],
                        "classification": item["classification"],
                        "clearance_required": item.get("clearance_required")
                        or _CLASS_LEVEL.get(item["classification"], 1),
                        "unit": item["unit"], "revision": item["revision"],
                        "source": "upload"}
                res = ingest_document(db, org_id=org.id, filename=item["filename"],
                                      data=path.read_bytes(), meta=meta)
                row.status = res["status"]; row.error = res["error"]
                row.chunks = res["chunks"]; row.ocr = res["ocr"]; row.doc_id = res["doc_id"]
                ok += res["status"] == "ok"; skipped += res["status"] == "skipped"
                print(f"[seed] {item['filename']}: {res['status']} "
                      f"({res['chunks']} chunks, ocr={res['ocr']})")
            except Exception as e:  # noqa: BLE001
                db.rollback()
                row.status = "failed"; row.error = str(e)[:500]; failed += 1
                print(f"[seed] {item['filename']}: FAILED {e}")
            db.commit()
        job.status = "done" if not failed else ("failed" if not ok else "done")
        job.summary = {"total": len(manifest), "ok": ok, "failed": failed, "skipped": skipped}
        from datetime import datetime, timezone
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        print(f"[seed] complete: {job.summary}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
