#!/bin/bash
set -e

echo "=== Manual Deployment to EC2 ==="
echo ""
echo "This script will SSH to your EC2 server and force-update the containers"
echo "with the latest images from GHCR."
echo ""

# Check required variables
if [ -z "$EC2_HOST" ]; then
  read -p "Enter EC2 hostname or IP: " EC2_HOST
fi

if [ -z "$EC2_USER" ]; then
  read -p "Enter SSH username (default: ubuntu): " EC2_USER
  EC2_USER=${EC2_USER:-ubuntu}
fi

if [ -z "$SSH_KEY" ]; then
  read -p "Enter path to SSH private key (default: ~/.ssh/id_rsa): " SSH_KEY
  SSH_KEY=${SSH_KEY:-~/.ssh/id_rsa}
fi

echo ""
echo "Connecting to: $EC2_USER@$EC2_HOST"
echo "SSH key: $SSH_KEY"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted"
    exit 1
fi

ssh -i "$SSH_KEY" "$EC2_USER@$EC2_HOST" << 'ENDSSH'
set -e

cd ~/boudreaux

echo "1. Stopping all containers..."
docker compose -f docker-compose.prod.yml down

echo ""
echo "2. Removing ALL Docker images (force clean slate)..."
docker rmi -f $(docker images -q) 2>/dev/null || echo "No images to remove"

echo ""
echo "3. Pruning Docker system..."
docker system prune -af --volumes

echo ""
echo "4. Logging into GHCR..."
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

echo ""
echo "5. Pulling latest images..."
docker pull ghcr.io/braveneworg/boudreaux/website:latest
docker pull ghcr.io/braveneworg/boudreaux/nginx:latest

echo ""
echo "6. Verifying images..."
docker images | grep braveneworg/boudreaux

echo ""
echo "7. Starting fresh containers..."
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "8. Waiting for startup..."
sleep 10

echo ""
echo "9. Verifying containers..."
docker ps

echo ""
echo "10. Checking website container logs..."
docker logs website --tail=30

echo ""
echo "11. Testing health endpoint..."
curl -s https://fakefourrecords.com/api/health | jq .

echo ""
echo "✅ Manual deployment complete!"
echo ""
echo "Run this locally to verify:"
echo "  curl -s https://fakefourrecords.com/ | grep -o 'webpack-[^\"]*\.js' | head -1"

ENDSSH

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Now run: ./scripts/verify-deployment-consistency.sh"
