"""Dashboard CRUD + data + drilldown (§9.2, §11.3.5)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from dkip.api.schemas import DashboardDataIn, DashboardIn
from dkip.core import audit
from dkip.core.deps import Principal, current_user, require_role
from dkip.db.base import get_db
from dkip.db.models import Dashboard
from dkip.structured.engine import fleet_aggregates

router = APIRouter(tags=["dashboards"])


@router.get("/dashboards")
def list_dashboards(user: Principal = Depends(current_user),
                    db: Session = Depends(get_db)):
    rows = db.execute(select(Dashboard).where(Dashboard.org_id == user.org_id)
                      .order_by(Dashboard.created_at.desc())).scalars().all()
    return [{"id": r.id, "name": r.name, "definition_json": r.definition_json,
             "created_at": r.created_at.isoformat()} for r in rows]


@router.post("/dashboards", status_code=201)
def create_dashboard(body: DashboardIn,
                     user: Principal = Depends(require_role("admin")),
                     db: Session = Depends(get_db)):
    dash = Dashboard(org_id=user.org_id, name=body.name,
                     definition_json=body.definition_json)
    db.add(dash)
    db.flush()
    audit.record(db, action="dashboard_create", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="dashboard",
                 target_id=dash.id)
    db.commit()
    return {"id": dash.id, "name": dash.name,
            "definition_json": dash.definition_json}


@router.post("/dashboards/{dash_id}/data")
def dashboard_data(dash_id: str, body: DashboardDataIn | None = None,
                   user: Principal = Depends(current_user),
                   db: Session = Depends(get_db)):
    dash = db.get(Dashboard, dash_id)
    if not dash:
        raise HTTPException(404, "dashboard not found")
    if dash.org_id != user.org_id:
        raise HTTPException(403, "not in your org")
    # For the built-in fleet dashboard, return fleet aggregates
    if dash.name == "Fleet Readiness":
        return fleet_aggregates(db)
    return {"id": dash.id, "name": dash.name, "data": {},
            "definition": dash.definition_json}


@router.get("/dashboards/{dash_id}/drilldown")
def dashboard_drilldown(dash_id: str, metric: str = "",
                        user: Principal = Depends(current_user),
                        db: Session = Depends(get_db)):
    dash = db.get(Dashboard, dash_id)
    if not dash:
        raise HTTPException(404, "dashboard not found")
    if dash.org_id != user.org_id:
        raise HTTPException(403, "not in your org")
    # Fleet drilldown: return all rows with computed serviceable %
    rows = db.execute(text(
        "SELECT unit, equipment, variant, total, serviceable, unserviceable, "
        "awaiting_spares, ROUND(100.0 * serviceable / NULLIF(total,0),1) AS "
        "readiness_pct FROM fleet_status ORDER BY unit, equipment"
    )).mappings().all()
    return {"dashboard": dash.name, "metric": metric,
            "rows": [dict(r) for r in rows], "row_count": len(rows)}


# Built-in fleet endpoint (backwards-compat)
@router.get("/dashboards/fleet")
def fleet_dashboard(user: Principal = Depends(current_user),
                    db: Session = Depends(get_db)):
    return fleet_aggregates(db)
