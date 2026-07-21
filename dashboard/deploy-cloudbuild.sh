#!/bin/bash

# Deploy to Cloud Run using Cloud Build
# This script triggers a Cloud Build pipeline that builds and deploys your app

set -e

echo "🚀 Deploying to Cloud Run via Cloud Build..."
echo ""

# Step 1: Submit the build to Cloud Build
echo "📦 Submitting build to Cloud Build..."
gcloud builds submit --config cloudbuild.yaml .

echo ""
echo "✅ Build submitted successfully!"
echo ""
echo "📋 Build includes:"
echo "   - Docker image build"
echo "   - Push to Container Registry"
echo "   - Deploy to Cloud Run with secrets"
echo "   - Environment variables: NODE_ENV, NEXT_PUBLIC_AGENT_DID"
echo "   - All secrets from Secret Manager"
echo ""
echo "📊 Monitor build progress:"
echo "   https://console.cloud.google.com/cloud-build/builds"
echo ""
echo "🔗 After deployment, test at:"
echo "   https://callwith-dashboard-972668869521.asia-south1.run.app/api/call-logs"
