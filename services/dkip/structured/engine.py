"""Structured-Data Q&A (§5.8, minimal). Constrained, read-only text-to-SQL over
a whitelisted catalog: the gateway writes the SELECT, we validate it against the
whitelist and run it read-only with a LIMIT guard — the DB does the arithmetic."""
from __future__ import annotations

import re

from sqlalchemy import text
from sqlalchemy.orm import Session

from dkip.gateway.factory import make_gateway

# The only table text-to-SQL may touch (§5.8 whitelist).
CATALOG = {
    "fleet_status": {
        "columns": {
            "unit": "text — formation, e.g. '12 Corps'",
            "equipment": "text — equipment class, e.g. 'Recovery Vehicle'",
            "variant": "text — variant, e.g. '5-tonne'",
            "total": "int — total holding",
            "serviceable": "int — currently serviceable",
            "unserviceable": "int — currently unserviceable",
            "awaiting_spares": "int — down awaiting spares",
        }
    }
}

_FORBIDDEN = re.compile(r"\b(insert|update|delete|drop|alter|create|truncate|"
                        r"grant|revoke|attach|copy|;)\b", re.I)


def _validate(sql: str) -> str:
    s = sql.strip().rstrip(";").strip()
    if not s.lower().startswith("select"):
        raise ValueError("only SELECT is permitted")
    if _FORBIDDEN.search(s):
        raise ValueError("disallowed SQL keyword")
    tables = set(re.findall(r"\bfrom\s+([a-z_][a-z0-9_]*)", s, re.I))
    tables |= set(re.findall(r"\bjoin\s+([a-z_][a-z0-9_]*)", s, re.I))
    if not tables <= set(CATALOG):
        raise ValueError(f"table not in whitelist: {tables - set(CATALOG)}")
    if " limit " not in s.lower():
        s += " LIMIT 200"
    return s


def structured_query(db: Session, question: str) -> dict:
    catalog_txt = "\n".join(
        f"TABLE {t}({', '.join(c + ' — ' + d for c, d in spec['columns'].items())})"
        for t, spec in CATALOG.items())
    prompt = (f"{catalog_txt}\n\nWrite ONE read-only PostgreSQL SELECT that answers "
              f"the question. Use only the whitelisted table(s) above. Return only "
              f"the SQL, no prose.\n\nQuestion: {question}")
    raw = make_gateway().generate(prompt, temperature=0.0, max_tokens=200).text
    sql = re.sub(r"^```(?:sql)?|```$", "", raw.strip(), flags=re.M).strip()
    safe = _validate(sql)
    rows = db.execute(text(safe)).mappings().all()
    return {"question": question, "sql": safe,
            "rows": [dict(r) for r in rows], "row_count": len(rows)}


def fleet_aggregates(db: Session) -> dict:
    try:
        by_status = db.execute(text(
            "SELECT SUM(serviceable) s, SUM(unserviceable) u, "
            "SUM(awaiting_spares) a, SUM(total) t FROM fleet_status")).mappings().first()
        by_equipment = db.execute(text(
            "SELECT equipment, SUM(serviceable) serviceable, SUM(total) total "
            "FROM fleet_status GROUP BY equipment ORDER BY total DESC")).mappings().all()
        by_unit = db.execute(text(
            "SELECT unit, SUM(serviceable) serviceable, SUM(total) total "
            "FROM fleet_status GROUP BY unit ORDER BY unit")).mappings().all()
        return {"kpi": dict(by_status) if by_status else {},
                "by_equipment": [dict(r) for r in by_equipment],
                "by_unit": [dict(r) for r in by_unit]}
    except Exception as e:
        return {"error": str(e), "kpi": {}, "by_equipment": [], "by_unit": []}
