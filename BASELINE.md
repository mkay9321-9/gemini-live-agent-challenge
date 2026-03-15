# Codebase Baseline

**Version:** 1.0.0  
**Date:** March 15, 2026  
**Status:** Hackathon submission ready (Gemini Live Agent Challenge 2026)

---

## Overview

Live Restaurant Menu Agent — an ADK-based FastAPI app for the Gemini Live Agent Challenge 2026. Real-time bidirectional streaming with Gemini models via WebSocket. Supports text, audio, and image input; text or audio output. Deployed on Google Cloud Run.

---

## Project Structure

```
gemini-challenge-2026/
├── app/
│   ├── main.py                    # FastAPI app, WebSocket handler
│   ├── .env                       # Local env (gitignored)
│   ├── .env.template              # Env var documentation
│   ├── menu_translator_final/
│   │   ├── __init__.py
│   │   └── agent.py               # ADK Agent (google_search, native audio)
│   └── static/
│       ├── index.html
│       ├── css/style.css
│       └── js/
│           ├── app.js
│           ├── audio-player.js
│           ├── audio-recorder.js
│           ├── pcm-player-processor.js
│           └── pcm-recorder-processor.js
├── scripts/
│   └── deploy.sh                  # Cloud Run deploy script
├── Dockerfile
├── .dockerignore
├── .gcloudignore
├── .gitignore
├── pyproject.toml
├── uv.lock
├── BASELINE.md
└── README.md
```

---

## Key Files

| File | Purpose |
|------|---------|
| `app/main.py` | FastAPI app, `/` serves index, `/ws/{user_id}/{session_id}` WebSocket, ADK Runner + LiveRequestQueue |
| `app/menu_translator_final/agent.py` | Agent with `google_search`, `gemini-2.5-flash-native-audio-preview-12-2025`, barge-in + menu image instructions |
| `app/static/js/app.js` | Frontend: WebSocket client, text/audio/image input, event console |
| `Dockerfile` | Python 3.12-slim, uv, `uv sync --no-install-project`, uvicorn from venv |
| `scripts/deploy.sh` | `gcloud run deploy --source .` with secrets, no local Docker |

---

## Dependencies (pyproject.toml)

- **google-adk** >= 1.20.0
- **fastapi** >= 0.115.0
- **python-dotenv** >= 1.0.0
- **uvicorn[standard]** >= 0.32.0

Dev: pytest, pytest-asyncio

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GOOGLE_API_KEY` | Gemini API key (Secret Manager in prod) |
| `GOOGLE_GENAI_USE_VERTEXAI` | `FALSE` for Gemini API, `TRUE` for Vertex AI |
| `AGENT_MODEL` | Model name (default: gemini-2.5-flash-native-audio-preview-12-2025) |

---

## Deployment

- **Platform:** Google Cloud Run
- **Method:** `gcloud run deploy --source .` (Cloud Build builds from Dockerfile)
- **Script:** `./scripts/deploy.sh`
- **Secrets:** `GOOGLE_API_KEY` from Secret Manager `google-api-key`
- **Config:** 1Gi memory, 3600s timeout (WebSocket)

---

## Architecture

- **HTTP:** `/` → index.html, `/static/*` → static files
- **WebSocket:** `/ws/{user_id}/{session_id}` → ADK `runner.run_live()` with LiveRequestQueue
- **Modalities:** Text, audio (PCM 16kHz), image (base64 JSON)
- **Model:** Native audio → AUDIO response; half-cascade → TEXT response
- **Session:** InMemorySessionService

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 1.0.0 | 2026-03-15 | Hackathon submission baseline; bidi-demo references removed; responsive mobile UI; deploy script |
