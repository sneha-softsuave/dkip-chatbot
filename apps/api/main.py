"""Thin API entrypoint. `uvicorn main:app` inside the api container."""
from dkip.api.app import app  # noqa: F401
