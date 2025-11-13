#!/bin/bash
set -e

# Force refresh containers on EC2 to match current S3 assets
# This manually triggers what the deploy workflow should do

echo "=== Force Container Refresh on EC2 ==="
echo ""
echo "This will:"
echo "1. Pull latest Docker images from GHCR"
echo "2. Stop all running containers"
echo "3. Remove old containers and images"
echo "4. Start fresh containers with latest images"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted"
    exit 1
fi

# Check required environment variables
if [ -z "$EC2_HOST" ] || [ -z "$EC2_USERNAME" ] || [ -z "$SSH_PRIVATE_KEY_PATH" ]; then
    echo "Error: Required environment variables not set:"
    echo "  EC2_HOST"
    echo "  EC2_USERNAME"
    echo "  SSH_PRIVATE_KEY_PATH"
    echo ""
    echo "Set them with:"
    echo "  export EC2_HOST=your-ec2-host"
    echo "  export EC2_USERNAME=ubuntu"
    echo "  export SSH_PRIVATE_KEY_PATH=~/.ssh/your-key.pem"
    exit 1
fi

echo ""
echo "Connecting to EC2: $EC2_USERNAME@$EC2_HOST"
echo ""

ssh -i "$SSH_PRIVATE_KEY_PATH" "$EC2_USERNAME@$EC2_HOST" << 'ENDSSH'
set -e

cd ~/boudreaux

echo "1. Logging into GitHub Container Registry..."
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

echo ""
echo "2. Pulling latest images..."
docker pull ghcr.io/braveneworg/boudreaux/website:latest
docker pull ghcr.io/braveneworg/boudreaux/nginx:latest

echo ""
echo "3. Stopping containers..."
docker compose -f docker-compose.prod.yml down

echo ""
echo "4. Removing old containers..."
docker rm -f website nginx 2>/dev/null || true

echo ""
echo "5. Pruning old images..."
docker image prune -af

echo ""
echo "6. Starting fresh containers..."
docker compose -f docker-compose.prod.yml up -d --force-recreate

echo ""
echo "7. Waiting for containers to start..."
sleep 10

echo ""
echo "8. Verifying containers..."
docker ps | grep -E 'website|nginx'

echo ""
echo "9. Checking logs..."
docker logs website --tail=20

echo ""
echo "✅ Container refresh complete!"

ENDSSH

echo ""
echo "=== Verification ==="
echo ""

# Wait a bit for containers to fully start
sleep 5

# Test the site
echo "Testing site..."
WEBPACK_FILE=$(curl -s https://fakefourrecords.com/ | grep -o 'webpack-[^"]*\.js' | head -1)
echo "HTML references: $WEBPACK_FILE"

echo ""
echo "Checking if it exists in S3..."
S3_WEBPACK=$(aws s3 ls s3://fakefourmedia/media/_next/static/chunks/ --recursive | grep webpack | awk '{print $4}' | xargs basename)
echo "S3 has: $S3_WEBPACK"

if [ "$WEBPACK_FILE" = "$S3_WEBPACK" ]; then
    echo ""
    echo "✅ SUCCESS! Containers and S3 are now in sync!"
    echo "No more 403 errors expected"
else
    echo ""
    echo "⚠️  Still mismatched. May need to wait for containers to fully restart."
fi
