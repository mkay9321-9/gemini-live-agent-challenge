# =============================================================================
# Dockerfile - Live Restaurant Menu Agent (Gemini Live Agent Challenge 2026)
# =============================================================================
# Summary: Builds a container for Cloud Run. Uses Python 3.12, uv for deps,
# and uvicorn to serve the FastAPI app. No local Docker required for deploy:
# use `gcloud run deploy --source .` (Cloud Build builds in the cloud).
# =============================================================================

# Step 1: Base image
FROM python:3.12-slim

WORKDIR /app

# Step 2: Install uv (fast Python package manager)
RUN pip install uv

# Step 3: Install dependencies only; skip project build (avoids README.md requirement)
# --no-install-project: installs fastapi, uvicorn, google-adk, etc. but not the project package
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --no-install-project

# Step 4: Copy application code
COPY app ./app

# Step 5: Cloud Run injects PORT at runtime (default 8080)
ENV PORT=8080
EXPOSE 8080

# Step 6: Run uvicorn from app/ (so menu_translator_final imports work)
# Use venv's uvicorn directly; uv run would trigger project build (needs README.md)
WORKDIR /app/app
CMD sh -c "/app/.venv/bin/uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"
