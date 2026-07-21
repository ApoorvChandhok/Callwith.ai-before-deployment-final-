# Quick Deployment Reference

## One-Command Deployment

```bash
# Run the deployment script (uses your GCP project: callwith-ai, region: asia-south1)
./deploy.sh
```

## Manual Deployment Steps

### 1. Commit Changes
```bash
git add .
git commit -m "feat: Add date range presets, infinite scroll, CRM sync status"
git push origin main
```

### 2. Build & Push Docker Image
```bash
# Build
docker build -t gcr.io/callwith-ai/callwith-dashboard:latest .

# Push
docker push gcr.io/callwith-ai/callwith-dashboard:latest
```

### 3. Deploy to Cloud Run (with secrets)
```bash
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

### 4. Test Deployment
```bash
# Test API endpoint
curl https://callwith-dashboard-972668869521.asia-south1.run.app/api/call-logs
```

## Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJhbG...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | `eyJhbG...` |
| `LIVEKIT_URL` | LiveKit WebSocket URL | `wss://xxx.livekit.cloud` |
| `LIVEKIT_API_KEY` | LiveKit API key | `APIKxxx` |
| `LIVEKIT_API_SECRET` | LiveKit API secret | `secretxxx` |
| `GROQ_API_KEY` | Groq API key | `gsk_xxx` |
| `NEXT_PUBLIC_AGENT_DID` | Agent DID number (NEW) | `918065480288` |

## Verify Deployment

```bash
# Get service URL
gcloud run services describe callwith-dashboard --region us-central1 --format="value(status.url)"

# Test API endpoint
curl https://callwith-dashboard-xxxxx-uc.a.run.app/api/call-logs

# Check logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=callwith-dashboard" --limit=50
```

## Rollback

```bash
# List revisions
gcloud run revisions list --service=callwith-dashboard --region=asia-south1

# Rollback to previous revision
gcloud run services update-traffic callwith-dashboard \
  --region=asia-south1 \
  --to-revisions=PREVIOUS_REVISION=100
```

## Cost Estimate

- **Cloud Run:** ~$0.000024/second (1 CPU, 512Mi RAM)
- **Container Registry:** ~$0.10/GB/month storage
- **Monthly estimate (low traffic):** $5-20/month

## Your GCP Configuration

- **Project ID:** `callwith-ai`
- **Region:** `asia-south1`
- **Service Name:** `callwith-dashboard`
- **Current URL:** `https://callwith-dashboard-972668869521.asia-south1.run.app`

## Support

- **Cloud Run Docs:** https://cloud.google.com/run/docs
- **gcloud CLI:** https://cloud.google.com/sdk/gcloud
- **Docker:** https://docs.docker.com
