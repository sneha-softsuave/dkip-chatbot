"""API/DB connector management (§6.5, §9.2). Connectors are deferred for
full runtime implementation but the management endpoints are wired."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from dkip.api.schemas import ConnectorIn
from dkip.core import audit
from dkip.core.deps import Principal, current_user, require_role
from dkip.db.base import get_db
from dkip.db.models import Connector

router = APIRouter(tags=["connectors"])


@router.get("/connectors")
def list_connectors(user: Principal = Depends(current_user),
                    db: Session = Depends(get_db)):
    rows = db.execute(select(Connector).where(Connector.org_id == user.org_id)
                      ).scalars().all()
    return [{"id": r.id, "kind": r.kind, "name": r.name,
             "schedule_cron": r.schedule_cron, "last_status": r.last_status,
             "enabled": r.enabled} for r in rows]


@router.post("/connectors", status_code=201)
def create_connector(body: ConnectorIn,
                     user: Principal = Depends(require_role("admin")),
                     db: Session = Depends(get_db)):
    if body.kind not in ("api", "db"):
        raise HTTPException(400, "kind must be 'api' or 'db'")
    conn = Connector(org_id=user.org_id, kind=body.kind, name=body.name,
                     config_json=body.config_json, secret_ref=body.secret_ref,
                     schedule_cron=body.schedule_cron, enabled=False)
    db.add(conn)
    db.flush()
    audit.record(db, action="connector_create", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id,
                 target_type="connector", target_id=conn.id)
    db.commit()
    return {"id": conn.id, "kind": conn.kind, "name": conn.name, "enabled": conn.enabled}


@router.post("/connectors/{conn_id}/test")
def test_connector(conn_id: str,
                   user: Principal = Depends(require_role("admin")),
                   db: Session = Depends(get_db)):
    conn = db.get(Connector, conn_id)
    if not conn:
        raise HTTPException(404, "connector not found")
    # Test-fetch stub: validate connectivity and update last_tested_at
    conn.last_tested_at = datetime.now(timezone.utc)
    conn.last_status = "ok"
    db.commit()
    audit.record(db, action="connector_test", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id,
                 target_type="connector", target_id=conn_id)
    return {"id": conn.id, "status": "ok", "tested_at": conn.last_tested_at.isoformat()}


@router.post("/connectors/{conn_id}/run")
def run_connector(conn_id: str,
                  user: Principal = Depends(require_role("admin")),
                  db: Session = Depends(get_db)):
    conn = db.get(Connector, conn_id)
    if not conn:
        raise HTTPException(404, "connector not found")
    if not conn.enabled:
        raise HTTPException(400, "connector is disabled — enable it first")
    audit.record(db, action="connector_run", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id,
                 target_type="connector", target_id=conn_id)
    return {"id": conn.id, "status": "triggered",
            "note": "connector runtime deferred (POC scope)"}
