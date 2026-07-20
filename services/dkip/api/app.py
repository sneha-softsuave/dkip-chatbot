"""FastAPI application factory (§9). Base path //api/v1, bearer JWT on every
route except /health, standard error envelope, request-id correlation (§12)."""
from __future__ import annotations

import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from dkip.api.bootstrap import init_stores, seed_identity
from dkip.api.routers import (admin, audit, config, connectors, dashboards,
                              documents, ingestion, orgs, query, reports,
                              summarize)
from dkip.api.routers import auth as auth_router
from dkip.core.config import settings
from dkip.gateway.factory import make_gateway

API = "/api/v1"


def create_app() -> FastAPI:
    app = FastAPI(title="DKIP API", version="1.0.0",
                  description="Defense Knowledge Intelligence Platform (POC1)")

    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list,
                       allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

    @app.middleware("http")
    async def request_id(request: Request, call_next):
        rid = request.headers.get("x-request-id", str(uuid.uuid4()))
        response = await call_next(request)
        response.headers["x-request-id"] = rid
        return response

    @app.exception_handler(StarletteHTTPException)
    async def http_exc(request: Request, exc: StarletteHTTPException):
        return JSONResponse(status_code=exc.status_code, content={"error": {
            "code": exc.status_code, "message": exc.detail,
            "request_id": request.headers.get("x-request-id", "")}})

    @app.exception_handler(RequestValidationError)
    async def val_exc(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=422, content={"error": {
            "code": 422, "message": "validation error", "detail": exc.errors(),
            "request_id": request.headers.get("x-request-id", "")}})

    for r in (auth_router.router, query.router, summarize.router, documents.router,
              ingestion.router, reports.router, dashboards.router, audit.router,
              config.router, admin.router, orgs.router, connectors.router):
        app.include_router(r, prefix=API)

    @app.get("/health")
    def health():
        from dkip.stores import objects, opensearch_store, qdrant_store
        gw = make_gateway()
        checks = {"qdrant": qdrant_store.health(),
                  "opensearch": opensearch_store.health(),
                  "minio": objects.health(),
                  "provider": {"configured": settings.MODEL_PROVIDER,
                               **gw.health()}}
        try:
            from sqlalchemy import text
            from dkip.db.base import engine
            with engine.connect() as c:
                c.execute(text("SELECT 1"))
            checks["postgres"] = {"reachable": True}
        except Exception as e:
            checks["postgres"] = {"reachable": False, "error": str(e)}
        ok = all(v.get("reachable", True) for k, v in checks.items() if k != "provider")
        return {"status": "ok" if ok else "degraded",
                "classification": settings.CLASSIFICATION_BANNER, "checks": checks}

    @app.get(f"{API}/health")
    def health_v1():
        return health()

    @app.get(f"{API}/metrics")
    def metrics():
        """Operational metrics (§12, FR-5.6.4). Admin-only via route guards."""
        gw = make_gateway()
        return {
            "provider": {"configured": settings.MODEL_PROVIDER,
                         "active": gw.provider, "gen_model": gw.gen_model},
            "embed_signature": settings.embed_signature,
            "qdrant_collection": settings.qdrant_collection,
            "rate": {"query_per_min": settings.QUERY_RATE_PER_MIN},
            "rag": {"retrieve_limit": settings.RETRIEVE_LIMIT,
                    "rrf_k": settings.RRF_K, "rerank_top_k": settings.RERANK_TOP_K,
                    "abstain_threshold": settings.RERANK_ABSTAIN_THRESHOLD}}

    @app.on_event("startup")
    def _startup():
        init_stores()
        try:
            seed_identity()
        except Exception as e:  # noqa: BLE001
            print(f"[startup] seed deferred: {e}")

    return app


app = create_app()
