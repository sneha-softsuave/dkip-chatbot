"""Central configuration. Every tunable is an env var so the same image runs
in the Compose demo and the air-gapped K8s deployment (Impl-Plan §13.3)."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ---- Model gateway (the one seam — Impl-Plan §7) -------------------------
    # cloud = OpenAI (demo) | local = vLLM/Ollama + BGE (air-gap) | fake = tests
    MODEL_PROVIDER: Literal["cloud", "local", "fake"] = "cloud"

    OPENAI_API_KEY: str | None = None
    OPENAI_BASE_URL: str | None = None
    OPENAI_GEN_MODEL: str = "gpt-4o-mini"
    OPENAI_EMBED_MODEL: str = "text-embedding-3-large"
    OPENAI_EMBED_DIM: int = 3072

    # local provider (air-gap)
    LOCAL_LLM_BASE_URL: str = "http://vllm:8000/v1"  # OpenAI-compatible
    LOCAL_LLM_MODEL: str = "qwen2.5"
    LOCAL_EMBED_BASE_URL: str = "http://embed:8080"
    LOCAL_EMBED_MODEL: str = "bge-large-en-v1.5"
    LOCAL_EMBED_DIM: int = 1024

    # rerank is ALWAYS local (Impl-Plan §7.2)
    RERANKER_URL: str = "http://reranker:8001"

    # ---- Stores --------------------------------------------------------------
    DATABASE_URL: str = "postgresql+psycopg://dkip:dkip@postgres:5432/dkip"
    QDRANT_URL: str = "http://qdrant:6333"
    OPENSEARCH_URL: str = "http://opensearch:9200"
    OPENSEARCH_INDEX: str = "dkip-chunks"
    REDIS_URL: str = "redis://redis:6379/0"

    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "dkip"
    MINIO_SECRET_KEY: str = "dkip-secret"
    MINIO_SECURE: bool = False
    MINIO_BUCKET_RAW: str = "raw"
    MINIO_BUCKET_OCR: str = "ocr"
    MINIO_BUCKET_EXPORTS: str = "exports"

    # ---- Identity ------------------------------------------------------------
    # Local JWT fallback (FR-5.1.5) is the guaranteed path; Keycloak is optional SSO.
    JWT_SECRET: str = "dev-only-change-me"
    JWT_ALG: str = "HS256"
    JWT_TTL_SECONDS: int = 60 * 60 * 8
    KEYCLOAK_ISSUER: str | None = None  # e.g. http://localhost:8085/realms/dkip
    KEYCLOAK_JWKS_URL: str | None = None
    KEYCLOAK_AUDIENCE: str = "dkip-web"

    # ---- RAG tunables (Impl-Plan §5) ----------------------------------------
    RETRIEVE_LIMIT: int = 50
    RRF_K: int = 60
    RRF_KEEP: int = 40
    RERANK_TOP_K: int = 6
    RERANK_ABSTAIN_THRESHOLD: float = 0.15  # below -> abstain (§5.5)
    CHUNK_TOKENS: int = 600
    CHUNK_OVERLAP: float = 0.12
    QUERY_RATE_PER_MIN: int = 30

    # ---- App -----------------------------------------------------------------
    CLASSIFICATION_BANNER: str = "UNCLASSIFIED // FOR DEMONSTRATION"
    CORS_ORIGINS: str = "http://localhost:8080,http://localhost:5173"
    DATA_DIR: str = "/data"

    @property
    def embed_signature(self) -> str:
        """Names the Qdrant collection so an index built with one embedder is
        never queried with another (Impl-Plan §7.3)."""
        if self.MODEL_PROVIDER == "cloud":
            return f"openai-3l-{self.OPENAI_EMBED_DIM}"
        if self.MODEL_PROVIDER == "local":
            return f"bge-{self.LOCAL_EMBED_DIM}"
        return "fake-256"

    @property
    def embed_dim(self) -> int:
        return {"cloud": self.OPENAI_EMBED_DIM,
                "local": self.LOCAL_EMBED_DIM,
                "fake": 256}[self.MODEL_PROVIDER]

    @property
    def qdrant_collection(self) -> str:
        return f"corpus__{self.embed_signature}"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
