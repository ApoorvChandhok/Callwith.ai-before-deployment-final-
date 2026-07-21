#!/bin/bash

# Quick Deployment Script for GCP Cloud Run
# Usage: ./deploy.sh [PROJECT_ID] [REGION]

set -e

# Default values - Updated with your specific configuration
PROJECT_ID=${1:-"callwith-ai"}
REGION=${2:-"asia-south1"}
SERVICE_NAME="callwith-dashboard"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 Deploying ${SERVICE_NAME} to GCP Cloud Run..."
echo "   Project: ${PROJECT_ID}"
echo "   Region: ${REGION}"
echo "   Service: ${SERVICE_NAME}"
echo ""

# Step 1: Build the Docker image
echo "📦 Building Docker image..."
docker build -t ${IMAGE_NAME}:latest .

# Step 2: Push to Google Container Registry
echo "📤 Pushing to Container Registry..."
docker push ${IMAGE_NAME}:latest

# Step 3: Deploy to Cloud Run with secrets from Secret Manager
echo "🔄 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:latest \
  --platform managed \
  --region ${REGION} \
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

# Step 4: Get the service URL
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Service URL:"
gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format="value(status.url)"

echo ""
echo "📝 Next steps:"
echo "   1. Test the deployment"
echo "   2. Check logs if needed: gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME}' --limit=50"
