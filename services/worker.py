"""Celery worker entry (§3 async ingest plane). `celery -A worker worker`."""
from __future__ import annotations

from celery import Celery

from dkip.core.config import settings

celery_app = Celery("dkip", broker=settings.REDIS_URL, backend=settings.REDIS_URL)
celery_app.conf.update(task_track_started=True, task_acks_late=True,
                       worker_prefetch_multiplier=1, task_time_limit=1200)

app = celery_app  # `celery -A worker` discovery alias

import dkip.ingest.tasks  # noqa: E402,F401  (register tasks)
