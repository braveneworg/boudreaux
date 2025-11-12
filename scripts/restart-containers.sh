#!/bin/bash

# Restart Docker containers on EC2 to pick up latest HTML with correct asset references
# This fixes 403 errors caused by outdated CSS/JS file references

set -e

EC2_HOST="${1:-ubuntu@13.216.75.242}"

echo "🔄 Restarting containers on $EC2_HOST..."

ssh -o StrictHostKeyChecking=no "$EC2_HOST" << 'ENDSSH'
  set -e
  cd ~/boudreaux

  echo "Pulling latest images..."
  docker compose -f docker-compose.prod.yml pull

  echo "Restarting containers..."
  docker compose -f docker-compose.prod.yml up -d --force-recreate

  echo "Waiting for containers to start..."
  sleep 5

  echo "Verifying containers are running..."
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

  echo "Checking health endpoint..."
  curl -k -fsS --max-time 10 https://fakefourrecords.com/api/health || echo "Health check failed"

  echo "✅ Containers restarted successfully!"
ENDSSH

echo ""
echo "✅ Container restart complete!"
echo ""
echo "Next steps:"
echo "1. Clear your browser cache or do a hard refresh (Cmd+Shift+R on Mac)"
echo "2. Visit https://fakefourrecords.com to verify CSS is loading"
echo "3. Check console for any remaining 403 errors"
