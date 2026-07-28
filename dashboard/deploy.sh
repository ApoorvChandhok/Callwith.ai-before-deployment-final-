#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Deploy script — callwith-dashboard → Google Cloud Run
#  Run from the dashboard/ directory:  bash deploy.sh
#
#  HOW ENV VARS & SECRETS ARE MANAGED:
#  • Sensitive secrets are stored in Google Secret Manager and
#    wired explicitly via --set-secrets.
#  • Non-sensitive config values are set via --set-env-vars.
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
GEMINI_MODEL=gemini-2.5-flash" \
    --set-secrets "\
NEXT_PUBLIC_SUPABASE_ANON_KEY=supabase-anon-key:latest,\
SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest,\
GROQ_API_KEY=groq-api-key:latest,\
LIVEKIT_URL=livekit-url:latest,\
LIVEKIT_API_KEY=livekit-api-key:latest,\
LIVEKIT_API_SECRET=livekit-api-secret:latest,\
DEEPGRAM_API_KEY=deepgram-api-key:latest,\
VOBIZ_AUTH_ID=vobiz-auth-id:latest,\
VOBIZ_AUTH_TOKEN=vobiz-auth-token:latest,\
TOOL_GATEWAY_SECRET=tool-gateway-secret:latest,\
CREDENTIALS_ENCRYPTION_KEY=credentials-encryption-key:latest,\
GOOGLE_CLIENT_ID=google-client-id:latest,\
GOOGLE_CLIENT_SECRET=google-client-secret:latest,\
GEMINI_API_KEY=gemini-api-key:latest,\
SARVAM_API_KEY=sarvam-api-key:latest"

echo ""
echo "✅  Deployment complete!"
echo "    Live at: $PROD_URL"
echo ""
