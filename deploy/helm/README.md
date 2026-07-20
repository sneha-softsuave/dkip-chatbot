# DKIP — Air-gapped Kubernetes / Helm (scaffold)

**Status: scaffold / documented (Impl-Plan §13.2).** The demo runs on Docker Compose (`deploy/compose`). Production targets an air-gapped Kubernetes cluster with the same images and the same application — **only the model provider config differs**.

## Production posture (target)

- One Helm chart per service (`web`, `api`, `worker`, `reranker`, `qdrant`, `opensearch`, `postgres`, `minio`, `keycloak`, `redis`).
- Images pulled from an **internal registry only** — no public pulls.
- `MODEL_PROVIDER=local`: a local vLLM/Ollama (OpenAI-compatible) LLM + a local BGE embedding server + the local cross-encoder reranker, all provisioned offline.
- GPU node(s) sized to the chosen open-weight model.
- Secrets via Vault / sealed-secrets; TLS via an internal CA; **no outbound network**.
- The embedding-signature re-index job (`python -m dkip.scripts.reindex`) runs once after the provider swap (§7.3).

## What carries over unchanged from the demo

The application container images (`services/Dockerfile`, `services/Dockerfile.reranker`, `apps/web/Dockerfile`), the data model, the API contract, and the entire UI are identical. Only environment configuration (provider endpoints, secrets, ingress) changes — the whole point of the model-gateway seam (§7).
