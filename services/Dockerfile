# Shared image for api + worker (§13.1). Build context = services/.
# OCR tools (Tesseract + OCRmyPDF) included for the worker's scanned-PDF path (§6.4).
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        ocrmypdf tesseract-ocr ghostscript curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
COPY dkip ./dkip
COPY worker.py ./
RUN pip install --upgrade pip && pip install .

EXPOSE 8000
# api uses dkip.api.app:app directly; worker overrides CMD in compose.
CMD ["uvicorn", "dkip.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
