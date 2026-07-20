# DKIP — Running the Platform

How to bring up the **Defense Knowledge Intelligence Platform (POC1)** demo stack and get to a working, cited answer.

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| **Docker Desktop** (with Compose v2) | Running, Linux containers. `docker --version` ≥ 24. |
| **RAM for Docker** | **≥ 8 GB** allocated (OpenSearch + Qdrant + Keycloak + the torch reranker are the heavy ones). 6 GB works if you skip Keycloak. |
| **Disk** | ~6 GB for images + the reranker model. |
| **OpenAI API key** | For the default `cloud` provider (real GPT + `text-embedding-3-large`). **Optional** — set `MODEL_PROVIDER=fake` to run fully offline with no key. |
| Ports free | `8080` web · `8000` api · `8085` keycloak · `9001` MinIO console · `6333` qdrant · `9200` opensearch · `5432` postgres · `6379` redis · `8001` reranker |

> **Windows (WSL2):** Docker Desktop handles the OpenSearch `vm.max_map_count` requirement automatically. On native Linux, run `sudo sysctl -w vm.max_map_count=262144` once if OpenSearch fails to start.

---

## 2. Configure

```bash
cd deploy/compose
cp .env.example .env
```

Edit `.env` and set your key:

```
MODEL_PROVIDER=cloud
OPENAI_API_KEY=sk-...your-key...
```

**No key?** Set `MODEL_PROVIDER=fake` — the platform runs fully offline with a deterministic extractive provider that still demonstrates grounding, citations, and abstention.

---

## 3. Bring the stack up

```bash
docker compose up -d --build
```

First run builds the api/worker/reranker/web images and, on first boot, the reranker downloads its cross-encoder model (~90 MB). Until it finishes, the reranker automatically uses a lexical fallback, so the stack is usable immediately.

Watch health until everything is green:

```bash
docker compose ps
curl -s http://localhost:8000/health | python -m json.tool
```

The **`seed`** service runs automatically once the API is healthy: it generates the fictional corpus, loads the fleet table, and ingests every document. Watch it:

```bash
docker compose logs -f seed
# ...
# [seed] OM-VEH-001.pdf: ok (4 chunks, ocr=False)
# [seed] SCAN-LOG-4471.pdf: ok (1 chunks, ocr=True)
# [seed] complete: {'total': 7, 'ok': 7, 'failed': 0, 'skipped': 0}
```

To re-run the seed manually at any time: `docker compose run --rm seed`.

---

## 4. Sign in

Open **http://localhost:8080**. Sign in with a demonstration account (also shown on the login screen):

| Username | Password | Role | Clearance |
|---|---|---|---|
| `admin` | `admin123` | admin | 4 |
| `analyst` | `analyst123` | user | 2 |
| `operator` | `operator123` | user | 1 |

Local sign-in is the guaranteed path. **Keycloak SSO** is also wired (realm `dkip`, same `admin`/`analyst` credentials) and appears as a button when configured — Keycloak console is at http://localhost:8085 (`admin`/`admin`).

---

## 5. Consoles & endpoints

| Service | URL | Login |
|---|---|---|
| Web app | http://localhost:8080 | demo accounts above |
| API docs (Swagger) | http://localhost:8000/docs | bearer token |
| Health | http://localhost:8000/health | — |
| Keycloak | http://localhost:8085 | admin / admin |
| MinIO console | http://localhost:9001 | dkip / dkip-secret |
| Qdrant | http://localhost:6333/dashboard | — |
| OpenSearch | http://localhost:9200 | — |

---

## 6. Cloud ↔ local model swap (the air-gap seam)

Only the AI provider changes between demo and production — the app, data model and UX are identical (PRD §4.9).

**generate + rerank swaps are zero data change.** The **embedding** provider swap needs a re-index because a vector index is only valid for the embedder that built it (§7.3).

**At runtime (admin, no restart):** in the app there is no direct toggle screen in this POC scope, but the endpoint exists:

```bash
# flip provider (admin token required)
curl -X PUT http://localhost:8000/api/v1/config/model-provider \
  -H "Authorization: Bearer <admin-token>" -H "Content-Type: application/json" \
  -d '{"provider":"fake"}'
```

**Durable (via env):** change `MODEL_PROVIDER` in `.env`, then:

```bash
docker compose up -d api worker            # rebind the gateway
docker compose run --rm seed python -m dkip.scripts.reindex   # re-embed corpus into the new signed collection
```

**Fully air-gapped (`MODEL_PROVIDER=local`):** point `LOCAL_LLM_BASE_URL` at a local vLLM/Ollama (OpenAI-compatible) server and `LOCAL_EMBED_BASE_URL` at a local BGE embedding server, then run the re-index job. No outbound network is used.

---

## 7. Teardown

```bash
docker compose down          # stop, keep data volumes
docker compose down -v       # stop and wipe all data (fresh start)
```

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `api` unhealthy, `/health` shows a store `reachable:false` | Give it a minute — OpenSearch/Keycloak boot slowly. `docker compose logs <service>`. |
| OpenSearch container exits on Linux | `sudo sysctl -w vm.max_map_count=262144` then `docker compose up -d opensearch`. |
| Answers come back but rerank is "lexical" in `/health` | The cross-encoder model is still downloading on first boot; it upgrades automatically. |
| `/health` provider shows `fake` but you set `cloud` | `OPENAI_API_KEY` is missing/empty — the gateway auto-degrades to `fake` rather than crashing. Set the key and `docker compose up -d api worker`. |
| Port already in use | Stop the conflicting service or edit the published ports in `docker-compose.yml`. |
| Seed says every file `skipped` | Content-hash dedupe — the corpus is already ingested. Expected on re-run. |
