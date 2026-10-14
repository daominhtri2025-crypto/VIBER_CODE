# Backend: FastAPI + SQLite. Data lives in the /data volume (never in the image).
FROM python:3.12-slim-bookworm AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv
RUN groupadd --system app && useradd --system --gid app --home /srv app
COPY api/requirements.txt api/requirements.txt
RUN pip install -r api/requirements.txt
# Code + the baseline schema/migrations + teacher-approved content (checksummed)
COPY database database
COPY content content
COPY api api
WORKDIR /srv/api
RUN mkdir -p /data /backups /ops && chown -R app:app /data /backups /ops
USER app
ENV APP_DB_PATH=/data/app.db BACKUP_DIR=/backups ERASURE_LEDGER_PATH=/ops/erasure_ledger.jsonl
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health')"
# Migrate (backs up first) on every start; idempotent. Then serve.
CMD ["sh", "-c", "test -f \"$APP_DB_PATH\" || python -m app.infrastructure.sqlite.cli init --db \"$APP_DB_PATH\"; python -m app.infrastructure.sqlite.cli migrate --db \"$APP_DB_PATH\" --backup-dir /backups/pre-migration && exec uvicorn app.api.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
