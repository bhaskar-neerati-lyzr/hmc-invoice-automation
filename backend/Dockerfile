# --- builder: compile/collect Python deps into a venv, kept out of the final image ---
FROM python:3.11-slim AS builder

WORKDIR /app

RUN python -m venv /venv
ENV PATH="/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- dev: local development target (docker-compose.dev.yml), live reload
# against a bind-mounted source tree. Not used by the default build. ---
FROM builder AS dev

WORKDIR /app

COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"]

# --- runtime: slim image, no compilers/caches, non-root - default target ---
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/venv/bin:$PATH"

RUN groupadd --system app && useradd --system --gid app --home-dir /app app

WORKDIR /app

COPY --from=builder /venv /venv
COPY . .

RUN chown -R app:app /app
USER app

EXPOSE 8000

# Applies any pending Alembic migrations, then starts the API. Safe to run
# on every container start: a no-op if the schema is already current.
# No --reload here - that's a dev-server feature; this image runs a fixed
# copy of the code, so file-watching is pure overhead.
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]
