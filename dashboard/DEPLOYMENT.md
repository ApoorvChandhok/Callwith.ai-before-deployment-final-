# GCP Deployment Guide

## Overview
This guide covers deploying the dashboard changes to Google Cloud Platform (GCP) using Docker and Cloud Run.

## Prerequisites
- Google Cloud SDK (`gcloud`) installed and configured
- Docker installed locally
- GCP project with billing enabled
- Container Registry (GCR) or Artifact Registry enabled

## Step 1: Commit and Push Changes

```bash
# Navigate to the dashboard directory
cd dashboard

# Add all changes
git add .

# Commit with descriptive message
git commit -m "feat: Add date range presets, infinite scroll, CRM sync status, and dynamic agent DID"

# Push to remote repository
git push origin main
```

## Step 2: Build Docker Image Locally (Optional - for testing)

```bash
# Build the Docker image
docker build -t callwith-dashboard:latest .

# Test locally
docker run -p 3000:3000 --env-file ../.env.local callwith-dashboard:latest
```

## Step 3: Deploy to GCP Cloud Run

### Option A: Using Google Cloud Build (Recommended)

1. **Enable Cloud Build API:**
   ```bash
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable run.googleapis.com
   gcloud services enable containerregistry.googleapis.com
   ```

2. **Submit build to Cloud Build:**
   ```bash
   # From the dashboard directory
   gcloud builds submit --tag gcr.io/callwith-ai/callwith-dashboard:latest
   ```

3. **Deploy to Cloud Run:**
   ```bash
   gcloud run deploy callwith-dashboard \
     --image gcr.io/callwith-ai/callwith-dashboard:latest \
     --platform managed \
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

### Option B: Using Local Docker + GCR

1. **Configure Docker for GCR:**
   ```bash
   gcloud auth configure-docker
   ```

2. **Build and tag the image:**
   ```bash
   docker build -t gcr.io/callwith-ai/callwith-dashboard:latest .
   ```

3. **Push to GCR:**
   ```bash
   docker push gcr.io/callwith-ai/callwith-dashboard:latest
   ```

4. **Deploy to Cloud Run:**
   ```bash
   gcloud run deploy callwith-dashboard \
     --image gcr.io/callwith-ai/callwith-dashboard:latest \
     --platform managed \
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

## Step 4: Environment Variables & Secrets

### Environment Variables (set via deploy command):
- `NODE_ENV`: `production`
- `NEXT_PUBLIC_AGENT_DID`: `918065480288`

### Secrets (managed via Google Secret Manager):
The deployment script automatically configures these secrets from Secret Manager:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `supabase-anon-key`
- `SUPABASE_SERVICE_ROLE_KEY` → `supabase-service-role-key`
- `GROQ_API_KEY` → `groq-api-key`
- `LIVEKIT_URL` → `livekit-url`
- `LIVEKIT_API_KEY` → `livekit-api-key`
- `LIVEKIT_API_SECRET` → `livekit-api-secret`
- `DEEPGRAM_API_KEY` → `deepgram-api-key`
- `VOBIZ_AUTH_ID` → `vobiz-auth-id`
- `VOBIZ_AUTH_TOKEN` → `vobiz-auth-token`
- `TOOL_GATEWAY_SECRET` → `tool-gateway-secret`
- `CREDENTIALS_ENCRYPTION_KEY` → `credentials-encryption-key`
- `GOOGLE_CLIENT_ID` → `google-client-id`
- `GOOGLE_CLIENT_SECRET` → `google-client-secret`

### To update secrets manually:
```bash
gcloud run services update callwith-dashboard \
  --region asia-south1 \
  --update-secrets "SECRET_NAME=secret-manager-name:latest"
```

## Step 5: Deploy Python Agent (if needed)

The Python agent (`agent_outbound.py`) runs separately. Deploy it to:

### Option A: Compute Engine VM
```bash
# SSH into your VM
gcloud compute ssh your-vm-name --zone=us-central1-a

# Pull latest changes
cd /path/to/project
git pull origin main

# Restart the agent
pkill -f agent_outbound.py
nohup python agent_outbound.py > agent.log 2>&1 &
```

### Option B: Cloud Run (for serverless)
```bash
# Build agent Docker image
cd ..
docker build -t gcr.io/YOUR_PROJECT_ID/callwith-agent:latest -f Dockerfile.agent .

# Deploy to Cloud Run
gcloud run deploy callwith-agent \
  --image gcr.io/YOUR_PROJECT_ID/callwith-agent:latest \
  --platform managed \
  --region us-central1 \
  --no-allow-unauthenticated \
  --port 8080
```

## Step 6: Verify Deployment

1. **Check Cloud Run service:**
   ```bash
   gcloud run services describe callwith-dashboard --region us-central1
   ```

2. **Get the service URL:**
   ```bash
   gcloud run services describe callwith-dashboard --region us-central1 --format="value(status.url)"
   ```

3. **Test the deployment:**
   ```bash
   curl https://callwith-dashboard-xxxxx-uc.a.run.app/api/call-logs
   ```

## Environment Variables Reference

### Required for Dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `GROQ_API_KEY`
- `NEXT_PUBLIC_AGENT_DID` (NEW - Agent DID number)

### Optional:
- `VOBIZ_SIP_TRUNK_ID`
- `VOBIZ_OUTBOUND_NUMBER`
- `VOBIZ_AUTH_ID`
- `VOBIZ_AUTH_TOKEN`
- `TOOL_GATEWAY_SECRET`
- `CREDENTIALS_ENCRYPTION_KEY`

## Troubleshooting

### Build Failures:
```bash
# Check build logs
gcloud builds list --limit=5
gcloud builds logs BUILD_ID
```

### Runtime Errors:
```bash
# Check Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=callwith-dashboard" --limit=50
```

### Environment Variable Issues:
```bash
# Verify env vars are set
gcloud run services describe callwith-dashboard --region asia-south1 --format="value(spec.template.spec.containers[0].env)"
```

## Cost Optimization

- **Min instances:** Set to 0 for dev/staging (scales to zero when not in use)
- **Max instances:** Set based on expected traffic (10-50 for production)
- **CPU:** Start with 1 CPU, scale up if needed
- **Memory:** 512Mi is usually sufficient for Next.js apps

## Rollback Procedure

If deployment fails:
```bash
# List revisions
gcloud run revisions list --service=callwith-dashboard --region=asia-south1

# Route traffic to previous revision
gcloud run services update-traffic callwith-dashboard \
  --region=asia-south1 \
  --to-revisions=PREVIOUS_REVISION_NAME=100
```

## Next Steps

After deployment:
1. Test all new features (date range filters, infinite scroll, CRM sync status)
2. Verify agent DID number is configurable via environment variable
3. Monitor Cloud Run logs for any errors
4. Set up Cloud Monitoring alerts for errors and latency
