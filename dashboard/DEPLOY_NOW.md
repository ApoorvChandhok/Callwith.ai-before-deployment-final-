# 🚀 Deploy Now - One Command

## Your Configuration
- **Project:** `callwith-ai`
- **Region:** `asia-south1`
- **Service:** `callwith-dashboard`
- **URL:** `https://callwith-dashboard-972668869521.asia-south1.run.app`

## Quick Deploy Commands

### Step 1: Commit & Push Changes
```bash
git add .
git commit -m "feat: Add date range presets, infinite scroll, CRM sync status"
git push origin main
```

### Step 2: Build & Deploy (with secrets)
```bash
# Build Docker image
docker build -t gcr.io/callwith-ai/callwith-dashboard:latest .

# Push to Container Registry
docker push gcr.io/callwith-ai/callwith-dashboard:latest

# Deploy to Cloud Run with secrets
gcloud run deploy callwith-dashboard \
  --image gcr.io/callwith-ai/callwith-dashboard:latest \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 20 \
  --set-env-vars "NODE_ENV=production,NEXT_PUBLIC_AGENT_DID=918065480288,NEXT_PUBLIC_SUPABASE_URL=https://yqvjwcinaefmxjhcojak.supabase.co,VOBIZ_SIP_TRUNK_ID=ST_FN8TAbxQaYnn,VOBIZ_OUTBOUND_NUMBER=+918065480288,NEXT_PUBLIC_BASE_URL=https://callwith-dashboard-972668869521.asia-south1.run.app,DASHBOARD_URL=https://callwith-dashboard-972668869521.asia-south1.run.app" \
  --update-secrets \
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=supabase-anon-key:latest,\
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
GOOGLE_CLIENT_SECRET=google-client-secret:latest"
```

### Step 4: Verify Deployment
```bash
# Get service URL
gcloud run services describe callwith-dashboard --region asia-south1 --format="value(status.url)"

# Test API
curl https://callwith-dashboard-972668869521.asia-south1.run.app/api/call-logs
```

## Environment Variables to Set

Make sure these are set in Cloud Run:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `GROQ_API_KEY`
- `NEXT_PUBLIC_AGENT_DID` (NEW - Agent DID number)

## Monitor Deployment

```bash
# Check logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=callwith-dashboard" --limit=50

# Check service status
gcloud run services describe callwith-dashboard --region asia-south1
```

## Rollback (if needed)

```bash
# List revisions
gcloud run revisions list --service=callwith-dashboard --region=asia-south1

# Rollback to previous revision
gcloud run services update-traffic callwith-dashboard \
  --region=asia-south1 \
  --to-revisions=PREVIOUS_REVISION=100
```

## What's Deployed

✅ **Date Range Presets** - Quick filtering by Today, Yesterday, Last 7 days, etc.
✅ **Infinite Scroll** - Automatic loading of more logs when scrolling
✅ **CRM Sync Status** - Shows which call logs are synced to CRM
✅ **Dynamic Agent DID** - Configurable via `NEXT_PUBLIC_AGENT_DID` environment variable
✅ **Fixed urllib Import** - Resolved the Python agent error

## Cost Estimate

- **Cloud Run:** ~$0.000024/second (1 CPU, 512Mi RAM)
- **Monthly estimate (low traffic):** $5-20/month
- **Scales to zero** when not in use (min-instances: 0)
