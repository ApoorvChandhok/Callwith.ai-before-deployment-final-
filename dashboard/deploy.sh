#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Deploy script — callwith-dashboard → Google Cloud Run
#  Run from the dashboard/ directory:  bash deploy.sh
#
#  HOW ENV VARS ARE MANAGED:
#  • Sensitive secrets (API keys, tokens) are stored in Google
#    Secret Manager and wired via secretKeyRef — they carry over
#    automatically on every deploy. DO NOT pass them here.
#  • Non-sensitive config values are set as plain env vars below.
# ═══════════════════════════════════════════════════════════════

set -e  # Exit immediately on any error

# ── Config ──────────────────────────────────────────────────────
SERVICE_NAME="callwith-dashboard"
REGION="asia-south1"
PROJECT="callwith-ai"
PROD_URL="https://callwith-dashboard-972668869521.asia-south1.run.app"

# Check gcloud is available
if ! command -v gcloud &> /dev/null; then
    echo "❌  gcloud CLI not found. Install it from https://cloud.google.com/sdk"
    exit 1
fi

echo ""
echo "🚀  Deploying $SERVICE_NAME to Cloud Run ($REGION)…"
echo "    Project : $PROJECT"
echo "    URL     : $PROD_URL"
echo ""

# ── Deploy ──────────────────────────────────────────────────────
# --source .          → Cloud Build builds the Dockerfile in this directory
# --set-env-vars      → Plain (non-secret) config only.
#                       Secret-backed vars carry over automatically from
#                       Secret Manager (supabase-anon-key, groq-api-key, etc.)
gcloud run deploy $SERVICE_NAME \
    --source . \
    --project $PROJECT \
    --region $REGION \
    --allow-unauthenticated \
    --port 3000 \
    --set-env-vars "\
NODE_ENV=production,\
NEXT_PUBLIC_SUPABASE_URL=https://yqvjwcinaefmxjhcojak.supabase.co,\
NEXT_PUBLIC_AGENT_DID=918065480288,\
NEXT_PUBLIC_BASE_URL=$PROD_URL,\
DASHBOARD_URL=$PROD_URL,\
VOBIZ_SIP_TRUNK_ID=ST_FN8TAbxQaYnn,\
VOBIZ_OUTBOUND_NUMBER=+918065480288,\
GEMINI_MODEL=gemini-2.5-flash"

echo ""
echo "✅  Deployment complete!"
echo "    Live at: $PROD_URL"
echo ""
