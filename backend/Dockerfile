FROM python:3.11-slim AS runtime

ARG REQUIREMENTS_FILE=requirements.txt
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TMPDIR=/tmp/background-removal

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libglib2.0-0 libgl1 libvips42 libmagic1 poppler-utils librsvg2-bin ghostscript \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app \
    && useradd --system --gid app --home-dir /app app

WORKDIR /app
COPY backend/requirements.txt backend/requirements-base.txt backend/requirements-gpu.txt ./
RUN pip install --requirement "${REQUIREMENTS_FILE}"

COPY backend/app ./app
COPY backend/migrations ./migrations
COPY backend/scripts ./scripts
COPY backend/alembic.ini ./alembic.ini
RUN mkdir -p /tmp/background-removal /models /data/objects \
    && chown -R app:app /app /tmp/background-removal /models /data/objects

USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=3)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
