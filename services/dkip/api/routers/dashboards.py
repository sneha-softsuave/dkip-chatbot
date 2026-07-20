"""Dashboards + structured Q&A (§9.2, §5.8, minimal). Aggregates over the
fleet_status table + a guarded text-to-SQL endpoint with drill-down rows."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from dkip.core import audit
from dkip.core.deps import Principal, current_user
from dkip.db.base import get_db
from dkip.structured.engine import fleet_aggregates, structured_query

router = APIRouter(tags=["dashboards"])


class StructuredIn(BaseModel):
    question: str


@router.get("/dashboards/fleet")
def fleet(user: Principal = Depends(current_user), db: Session = Depends(get_db)):
    return fleet_aggregates(db)


@router.post("/structured/query")
def structured(body: StructuredIn, user: Principal = Depends(current_user),
               db: Session = Depends(get_db)):
    try:
        result = structured_query(db, body.question)
    except ValueError as e:
        raise HTTPException(422, str(e))
    audit.record(db, action="structured_query", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id,
                 request_meta={"question": body.question, "sql": result["sql"]})
    return result
