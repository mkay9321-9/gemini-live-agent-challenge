#!/usr/bin/env bash
# =============================================================================
# deploy.sh - Deploy Live Restaurant Menu Agent to Google Cloud Run
# =============================================================================
# Summary: One-command deploy using gcloud run deploy --source . Cloud Build
# builds the container in the cloud (no local Docker required). Satisfies
# hackathon bonus: "Prove you automated your Cloud Deployment."
#
# Prerequisites:
#   - gcloud CLI (gcloud auth login, gcloud config set project)
#   - Google Cloud project with billing enabled
#   - Secret "google-api-key" in Secret Manager
#
# Usage:
#   ./scripts/deploy.sh
#   PROJECT_ID=my-project ./scripts/deploy.sh
# =============================================================================

set -e

# --- Step 1: Configuration (override with env vars) ---
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
SERVICE_NAME="${SERVICE_NAME:-menu-translator}"
REGION="${REGION:-us-central1}"
SECRET_NAME="${SECRET_NAME:-google-api-key}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== Menu Translator - Cloud Run Deployment ==="
echo ""

# Validate gcloud, project, and Dockerfile exist
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed.${NC}"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Validate project is set
if [[ -z "$PROJECT_ID" ]]; then
    echo -e "${RED}Error: No Google Cloud project configured.${NC}"
    echo "Run: gcloud init"
    echo "Or set: PROJECT_ID=your-project-id ./scripts/deploy.sh"
    exit 1
fi

echo "Project:  $PROJECT_ID"
echo "Service: $SERVICE_NAME"
echo "Region:  $REGION"
echo ""

# Ensure we're in the project root (parent of scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

if [[ ! -f "Dockerfile" ]]; then
    echo -e "${RED}Error: Dockerfile not found. Run from project root.${NC}"
    exit 1
fi

# --- Step 3: Enable APIs (idempotent) ---
echo "Enabling required APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com --project="$PROJECT_ID" --quiet 2>/dev/null || true

# --- Step 4: Deploy (Cloud Build builds from Dockerfile, deploys to Cloud Run) ---
echo ""
echo "Deploying to Cloud Run (this may take a few minutes)..."
echo ""

gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --set-secrets="GOOGLE_API_KEY=${SECRET_NAME}:latest" \
  --set-env-vars="GOOGLE_GENAI_USE_VERTEXAI=FALSE,DEMO_AGENT_MODEL=gemini-2.5-flash-native-audio-preview-12-2025" \
  --timeout 3600 \
  --memory 1Gi

echo ""
echo -e "${GREEN}Deployment complete!${NC}"
echo ""
echo "Your service is live. Fetch the URL with:"
echo "  gcloud run services describe $SERVICE_NAME --region $REGION --format='value(status.url)'"
echo ""
