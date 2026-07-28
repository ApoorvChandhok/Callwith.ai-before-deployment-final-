#!/bin/bash
# Deployment script for Google Cloud Run (Dashboard)

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null
then
    echo "gcloud CLI could not be found. Please install it first."
    exit 1
fi

echo "Deploying Dashboard to Google Cloud Run..."

# Set standard configuration matching the existing deployment
SERVICE_NAME="callwith-dashboard"
REGION="asia-south1"

echo "Service: $SERVICE_NAME"
echo "Region: $REGION"

# Deploy using source (Cloud Build will automatically detect the Dockerfile)
gcloud run deploy $SERVICE_NAME \
    --source . \
    --region $REGION \
    --allow-unauthenticated \
    --port 3000

echo "Deployment complete!"
