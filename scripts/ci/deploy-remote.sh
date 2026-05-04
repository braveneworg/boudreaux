#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Executed on the remote EC2 instance via SSH during deployment.
# Handles: Docker setup, TLS certificate management (Let's Encrypt / self-signed
# fallback), image pull with digest pinning, container restart, health check,
# rollback, and digest audit persistence.
#
# Usage: ./deploy-remote.sh
# Env (required):
#   WEBSITE_IMAGE       - Full GHCR image name for the website container
#   NGINX_IMAGE         - Full GHCR image name for the nginx container
#   GHCR_TOKEN          - GitHub Container Registry token
#   GHCR_USERNAME       - GitHub Container Registry username
# Env (optional):
#   WEBSITE_DIGEST      - sha256 digest to pin the website image
#   NGINX_DIGEST        - sha256 digest to pin the nginx image
#   REQUIRE_TRUSTED_CERT - 'true' to fail deploy if self-signed cert remains
#   LETSENCRYPT_EMAIL   - Email for Let's Encrypt registration

set -euo pipefail

# ---------------------------------------------------------------------------
# Disk space check
# ---------------------------------------------------------------------------
echo "Checking available disk space..."
AVAILABLE_GB=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
echo "Available disk space: ${AVAILABLE_GB}GB"

if [ "$AVAILABLE_GB" -lt 2 ]; then
  echo "⚠️  WARNING: Low disk space (${AVAILABLE_GB}GB available)"
  echo "Running Docker cleanup to free space..."
  docker system prune -af --volumes || true

  AVAILABLE_GB=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
  echo "After cleanup: ${AVAILABLE_GB}GB available"

  if [ "$AVAILABLE_GB" -lt 1 ]; then
    echo "❌ ERROR: Insufficient disk space (${AVAILABLE_GB}GB). Need at least 1GB free."
    exit 1
  fi
else
  echo "✓ Sufficient disk space available"
fi

# ---------------------------------------------------------------------------
# Directory and permission setup
# ---------------------------------------------------------------------------
mkdir -p ~/boudreaux
mkdir -p ~/boudreaux/.deploy

# Create certbot-webroot with sudo if permission denied
if [ ! -d ~/boudreaux/certbot-webroot ]; then
  sudo mkdir -p ~/boudreaux/certbot-webroot/.well-known/acme-challenge
  sudo chown -R "$(whoami):$(id -gn)" ~/boudreaux/certbot-webroot
  sudo chmod -R 755 ~/boudreaux/certbot-webroot
fi

# Ensure SSH authorized_keys has correct permissions
mkdir -p ~/.ssh
chmod 700 ~/.ssh
if [ -f ~/.ssh/authorized_keys ]; then
  chmod 600 ~/.ssh/authorized_keys
fi

cd ~/boudreaux
TARGET_DIR="$(pwd)"
LOCAL_USER="$(whoami)"
LOCAL_GROUP="$(id -gn)"

# ---------------------------------------------------------------------------
# Docker installation (one-time bootstrap)
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get remove -y docker.io docker-doc docker-compose podman-docker containerd runc 2>/dev/null || true
  sudo apt-get install -y ca-certificates curl gnupg lsb-release
  if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
  fi
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo systemctl enable docker
  sudo systemctl start docker
fi

# Ensure user is in docker group (required for non-root Docker access)
if ! groups | grep -q docker; then
  echo "Adding $USER to docker group..."
  sudo usermod -aG docker "$USER"
  echo "User added to docker group. Note: This session will use 'sudo docker' for remaining commands."
fi

# Set DOCKER_CMD based on whether sudo is required in this session
if docker ps >/dev/null 2>&1; then
  DOCKER_CMD="docker"
else
  echo "Using sudo for Docker commands (group membership not yet active in this session)"
  DOCKER_CMD="sudo docker"
fi

# ---------------------------------------------------------------------------
# TLS certificate management
# ---------------------------------------------------------------------------
echo "Certificate enforcement: REQUIRE_TRUSTED_CERT=${REQUIRE_TRUSTED_CERT:-false}"
if [ -f "$HOME/boudreaux/.selfsigned" ]; then
  echo "Current TLS mode: self-signed (marker present)"
else
  echo "Current TLS mode: trusted (no self-signed marker)"
fi

# Install certbot if not present (one-time setup)
if ! command -v certbot >/dev/null 2>&1; then
  echo "Installing certbot..."
  sudo apt-get update -qq
  sudo apt-get install -y certbot
fi

DOMAIN="fakefourrecords.com"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

# Configure email args for certbot (supports no-email fallback)
if [ -n "${LETSENCRYPT_EMAIL:-}" ]; then
  CERTBOT_EMAIL_ARGS=(--email "$LETSENCRYPT_EMAIL")
else
  echo "WARNING: LETSENCRYPT_EMAIL is not set; proceeding without registration email."
  CERTBOT_EMAIL_ARGS=(--register-unsafely-without-email)
fi

# Check if certificate needs acquisition or renewal
NEEDS_CERT=false
if ! sudo test -f "$CERT_PATH/fullchain.pem"; then
  echo "No certificate found at $CERT_PATH — need initial issuance."
  NEEDS_CERT=true
else
  echo "Checking certificate expiration..."
  CERT_EXPIRY=$(sudo openssl x509 -enddate -noout -in "$CERT_PATH/fullchain.pem" 2>/dev/null | cut -d= -f2 || true)
  if [ -n "$CERT_EXPIRY" ]; then
    echo "Certificate expires: $CERT_EXPIRY"
    if ! sudo openssl x509 -checkend 2592000 -noout -in "$CERT_PATH/fullchain.pem" 2>/dev/null; then
      echo "⚠️  Certificate is expired or expiring within 30 days — forcing renewal."
      NEEDS_CERT=true
    else
      echo "✓ Certificate is valid for more than 30 days."
    fi
  else
    echo "WARNING: Could not read certificate expiration — forcing renewal."
    NEEDS_CERT=true
  fi
fi

if [ "$NEEDS_CERT" = true ]; then
  echo "Obtaining/renewing Let's Encrypt certificate for $DOMAIN..."

  # Try renewal first WITHOUT stopping containers (works if cert uses webroot authenticator)
  if sudo certbot renew --cert-name "$DOMAIN" --force-renewal --non-interactive; then
    echo "✓ Certificate renewed successfully via certbot renew (with containers running)."
  else
    echo "certbot renew failed with containers running — trying with containers stopped..."
    $DOCKER_CMD stop nginx website 2>/dev/null || true

    if sudo certbot renew --cert-name "$DOMAIN" --force-renewal --non-interactive; then
      echo "✓ Certificate renewed successfully via certbot renew (with containers stopped)."
    else
      echo "certbot renew failed — no existing cert found, trying initial issuance..."
      sudo certbot certonly --standalone --non-interactive --agree-tos \
        "${CERTBOT_EMAIL_ARGS[@]}" \
        -d "$DOMAIN" -d "www.$DOMAIN" || {
        echo "WARNING: Standalone certificate acquisition failed."
      }
    fi
  fi
fi

# Always copy the latest cert from letsencrypt to deployment directory.
# Note: sudo required because /etc/letsencrypt/live/ is root-only (drwx------)
if sudo test -f "$CERT_PATH/fullchain.pem"; then
  echo "Installing Let's Encrypt certificate to deployment directory..."
  sudo install -o "$LOCAL_USER" -g "$LOCAL_GROUP" -m 644 "$CERT_PATH/fullchain.pem" "$TARGET_DIR/certificate.pem"
  sudo install -o "$LOCAL_USER" -g "$LOCAL_GROUP" -m 600 "$CERT_PATH/privkey.pem" "$TARGET_DIR/private_key.pem"
  sudo chmod 644 "$TARGET_DIR/certificate.pem"
  sudo chmod 600 "$TARGET_DIR/private_key.pem"

  # Verify the deployed cert is not expired before proceeding
  if sudo openssl x509 -checkend 0 -noout -in "$TARGET_DIR/certificate.pem" 2>/dev/null; then
    DEPLOY_EXPIRY=$(sudo openssl x509 -enddate -noout -in "$TARGET_DIR/certificate.pem" | cut -d= -f2)
    echo "✓ Deployed certificate is valid (expires: $DEPLOY_EXPIRY)"
  else
    OPENSSL_STATUS=$?
    if [ "$OPENSSL_STATUS" -eq 1 ]; then
      echo "❌ ERROR: Deployed certificate is expired even after renewal attempt."
      echo "Removing stale cert files so self-signed fallback can take over."
      rm -f "$TARGET_DIR/certificate.pem" "$TARGET_DIR/private_key.pem"
    else
      echo "❌ ERROR: Failed to verify deployed certificate with openssl (exit code: $OPENSSL_STATUS)."
      echo "Leaving existing certificate files in place. Check certificate PEM, permissions, and openssl output on the server."
    fi
  fi

  # Setup automatic renewal cron (idempotent)
  echo "Ensuring automatic certificate renewal cron job is configured..."
  if ! sudo crontab -l 2>/dev/null | grep -Fq "certbot renew"; then
    CRON_CMD="0 3 * * * certbot renew --deploy-hook \"install -o $LOCAL_USER -g $LOCAL_GROUP -m 644 $CERT_PATH/fullchain.pem $TARGET_DIR/certificate.pem && install -o $LOCAL_USER -g $LOCAL_GROUP -m 600 $CERT_PATH/privkey.pem $TARGET_DIR/private_key.pem && chmod 600 $TARGET_DIR/private_key.pem && chmod 644 $TARGET_DIR/certificate.pem && (docker restart nginx || true)\" >> /var/log/certbot-renew.log 2>&1"
    (sudo crontab -l 2>/dev/null; printf '%s\n' "$CRON_CMD") | sudo crontab -
    echo "✓ Cron job added: Certificate will auto-renew daily at 3 AM"
  else
    echo "✓ Cron job already configured"
  fi

  # Remove self-signed marker if present
  if [ -f "$HOME/boudreaux/.selfsigned" ]; then
    rm -f "$HOME/boudreaux/.selfsigned"
    echo "Removed self-signed marker; Let's Encrypt certs are active."
  fi
fi

# Fallback: create self-signed cert if no valid cert exists
if [ ! -f "$HOME/boudreaux/certificate.pem" ] || [ ! -f "$HOME/boudreaux/private_key.pem" ]; then
  echo "Generating temporary self-signed certificate to satisfy compose secrets..."
  if ! command -v openssl >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo apt-get install -y openssl
  fi
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
    -subj "/CN=${DOMAIN}" \
    -keyout "$HOME/boudreaux/private_key.pem" \
    -out "$HOME/boudreaux/certificate.pem"
  sudo chmod 600 "$HOME/boudreaux/private_key.pem" || true
  sudo chmod 644 "$HOME/boudreaux/certificate.pem" || true
  touch "$HOME/boudreaux/.selfsigned"
  echo "Self-signed certificate created; will attempt Let's Encrypt issuance after containers start."
fi

# ---------------------------------------------------------------------------
# Environment and image setup
# ---------------------------------------------------------------------------
mv -f .env.deploy .env
chmod 600 .env

echo "${GHCR_TOKEN}" | $DOCKER_CMD login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

# Capture previously deployed digests (for rollback if needed)
PREV_WEBSITE_DIGEST=$($DOCKER_CMD inspect --format '{{index .RepoDigests 0}}' "$WEBSITE_IMAGE" 2>/dev/null || true)
PREV_NGINX_DIGEST=$($DOCKER_CMD inspect --format '{{index .RepoDigests 0}}' "$NGINX_IMAGE" 2>/dev/null || true)

# Remove old :latest tagged images to prevent Docker from using stale cache
echo "Removing old :latest images to force fresh pull..."
$DOCKER_CMD rmi "$WEBSITE_IMAGE:latest" 2>/dev/null || true
$DOCKER_CMD rmi "$NGINX_IMAGE:latest" 2>/dev/null || true

# Pull by digest if provided; otherwise use latest
if [ -n "${WEBSITE_DIGEST:-}" ] && [ -n "${NGINX_DIGEST:-}" ]; then
  echo "Using provided digests for deployment"
  echo "  Website: $WEBSITE_DIGEST"
  echo "  Nginx:   $NGINX_DIGEST"

  $DOCKER_CMD pull "$WEBSITE_IMAGE@$WEBSITE_DIGEST" || {
    echo "❌ Failed to pull website image with digest"
    exit 1
  }
  $DOCKER_CMD pull "$NGINX_IMAGE@$NGINX_DIGEST" || {
    echo "❌ Failed to pull nginx image with digest"
    exit 1
  }

  $DOCKER_CMD tag "$WEBSITE_IMAGE@$WEBSITE_DIGEST" "$WEBSITE_IMAGE:latest"
  $DOCKER_CMD tag "$NGINX_IMAGE@$NGINX_DIGEST" "$NGINX_IMAGE:latest"
  NEW_WEBSITE_DIGEST="$WEBSITE_IMAGE@$WEBSITE_DIGEST"
  NEW_NGINX_DIGEST="$NGINX_IMAGE@$NGINX_DIGEST"
else
  echo "No digests provided; using latest tags"
  $DOCKER_CMD pull "$WEBSITE_IMAGE:latest" || {
    echo "❌ Failed to pull website image"
    exit 1
  }
  $DOCKER_CMD pull "$NGINX_IMAGE:latest" || {
    echo "❌ Failed to pull nginx image"
    exit 1
  }
  NEW_WEBSITE_DIGEST=$($DOCKER_CMD inspect --format '{{index .RepoDigests 0}}' "$WEBSITE_IMAGE:latest" 2>/dev/null || true)
  NEW_NGINX_DIGEST=$($DOCKER_CMD inspect --format '{{index .RepoDigests 0}}' "$NGINX_IMAGE:latest" 2>/dev/null || true)
  if [ -z "$NEW_WEBSITE_DIGEST" ]; then
    echo "❌ Unable to determine digest for website image after pull"
    exit 1
  fi
  if [ -z "$NEW_NGINX_DIGEST" ]; then
    echo "❌ Unable to determine digest for nginx image after pull"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Container restart
# ---------------------------------------------------------------------------
echo "Stopping existing containers..."
$DOCKER_CMD compose -f docker-compose.prod.yml down --remove-orphans || true

echo "Removing old containers..."
$DOCKER_CMD rm -f website nginx 2>/dev/null || true

echo "Verifying fresh images..."
CURRENT_WEBSITE_ID=$($DOCKER_CMD images "$WEBSITE_IMAGE:latest" --format "{{.ID}}")
CURRENT_NGINX_ID=$($DOCKER_CMD images "$NGINX_IMAGE:latest" --format "{{.ID}}")
echo "  Website image ID: $CURRENT_WEBSITE_ID"
echo "  Nginx image ID:   $CURRENT_NGINX_ID"

echo "Starting containers with fresh images..."
$DOCKER_CMD compose -f docker-compose.prod.yml up -d --force-recreate

# Verify containers are running
echo "Verifying containers started successfully..."
sleep 5
RUNNING_CONTAINERS=$($DOCKER_CMD ps --format '{{.Names}}' | grep -E 'website|nginx' | wc -l)
if [ "$RUNNING_CONTAINERS" -lt 2 ]; then
  echo "ERROR: Expected 2 containers (website, nginx) but found $RUNNING_CONTAINERS"
  $DOCKER_CMD ps -a
  $DOCKER_CMD compose -f docker-compose.prod.yml logs --tail=50
  exit 1
fi
echo "✓ Both containers are running"

# Give containers time to fully start serving content
sleep 5

# ---------------------------------------------------------------------------
# Health check with rollback
# ---------------------------------------------------------------------------
echo "Running health check..."
CURL_OPTS="-fsS --max-time 10"
if [ -f "$HOME/boudreaux/.selfsigned" ]; then
  echo "Self-signed cert in use; allowing insecure TLS for health check"
  CURL_OPTS="-k $CURL_OPTS"
fi

# shellcheck disable=SC2086
if ! curl $CURL_OPTS https://fakefourrecords.com/api/health; then
  echo 'Health check failed - attempting rollback'

  if [ -n "$PREV_WEBSITE_DIGEST" ]; then
    $DOCKER_CMD pull "$PREV_WEBSITE_DIGEST" || true
    $DOCKER_CMD tag "$PREV_WEBSITE_DIGEST" "$WEBSITE_IMAGE:latest" || true
  fi
  if [ -n "$PREV_NGINX_DIGEST" ]; then
    $DOCKER_CMD pull "$PREV_NGINX_DIGEST" || true
    $DOCKER_CMD tag "$PREV_NGINX_DIGEST" "$NGINX_IMAGE:latest" || true
  fi

  $DOCKER_CMD compose -f docker-compose.prod.yml up -d --force-recreate
  sleep 5
  if ! curl -fsS --max-time 10 https://fakefourrecords.com/api/health; then
    echo 'Rollback health check failed - manual intervention required'
    exit 1
  else
    echo 'Rollback successful'
  fi
fi

# ---------------------------------------------------------------------------
# Let's Encrypt webroot issuance (if using self-signed fallback)
# ---------------------------------------------------------------------------
if [ -f "$HOME/boudreaux/.selfsigned" ]; then
  echo "Self-signed certificate detected; attempting Let's Encrypt issuance via webroot with retries..."

  echo "=== Pre-flight checks ==="

  RESOLVED_IP=$(dig +short "$DOMAIN" | head -n1 || true)
  if [ -z "$RESOLVED_IP" ]; then
    echo "WARNING: DNS resolution failed for $DOMAIN"
  else
    echo "DNS: $DOMAIN resolves to $RESOLVED_IP"
  fi

  TEST_TOKEN="deploy-$(date +%s)"
  echo "$TEST_TOKEN" > "$HOME/boudreaux/certbot-webroot/.well-known/acme-challenge/_test"
  if curl -s --max-time 5 "http://$DOMAIN/.well-known/acme-challenge/_test" | grep -q "$TEST_TOKEN"; then
    echo "Port 80: Accessible (HTTP responded)"
  else
    echo "WARNING: Port 80 may be blocked or nginx not serving challenges"
    echo "Ensure Security Group allows inbound TCP 80 from 0.0.0.0/0"
  fi

  if [ -d "$HOME/boudreaux/certbot-webroot/.well-known/acme-challenge" ]; then
    echo "Webroot: Challenge directory exists"
    if [ -w "$HOME/boudreaux/certbot-webroot/.well-known/acme-challenge" ]; then
      echo "Webroot: Directory is writable"
    else
      echo "WARNING: Webroot challenge directory is not writable"
    fi
  else
    echo "ERROR: Webroot challenge directory should have been created by deploy setup"
  fi

  echo "==========================="

  attempts=0
  max_attempts=3
  backoff_base=30
  while [ $attempts -lt $max_attempts ]; do
    echo "Issuance attempt $((attempts+1)) of $max_attempts"
    sudo certbot certonly --webroot -w "$HOME/boudreaux/certbot-webroot" \
      --non-interactive --agree-tos \
      "${CERTBOT_EMAIL_ARGS[@]}" \
      -d "$DOMAIN" -d "www.$DOMAIN" && break || {
        echo "Issuance attempt $((attempts+1)) failed"
      }
    attempts=$((attempts+1))
    if [ $attempts -lt $max_attempts ]; then
      sleep_duration=$((backoff_base * attempts))
      echo "Sleeping $sleep_duration seconds before retry..."
      sleep "$sleep_duration"
    fi
  done

  if sudo test -f "$CERT_PATH/fullchain.pem"; then
    echo "Webroot issuance succeeded; activating Let's Encrypt certificate."
    sudo install -o "$LOCAL_USER" -g "$LOCAL_GROUP" -m 644 "$CERT_PATH/fullchain.pem" "$HOME/boudreaux/certificate.pem"
    sudo install -o "$LOCAL_USER" -g "$LOCAL_GROUP" -m 600 "$CERT_PATH/privkey.pem" "$HOME/boudreaux/private_key.pem"
    sudo chmod 644 "$HOME/boudreaux/certificate.pem"
    sudo chmod 600 "$HOME/boudreaux/private_key.pem"
    rm -f "$HOME/boudreaux/.selfsigned" || true

    echo "Setting up automatic certificate renewal cron job..."
    if ! sudo crontab -l 2>/dev/null | grep -Fq "certbot renew"; then
      CRON_CMD="0 3 * * * certbot renew --deploy-hook \"install -o $LOCAL_USER -g $LOCAL_GROUP -m 644 $CERT_PATH/fullchain.pem $HOME/boudreaux/certificate.pem && install -o $LOCAL_USER -g $LOCAL_GROUP -m 600 $CERT_PATH/privkey.pem $HOME/boudreaux/private_key.pem && chmod 600 $HOME/boudreaux/private_key.pem && chmod 644 $HOME/boudreaux/certificate.pem && (docker restart nginx || true)\" >> /var/log/certbot-renew.log 2>&1"
      (sudo crontab -l 2>/dev/null; printf '%s\n' "$CRON_CMD") | sudo crontab -
      echo "✓ Cron job added: Certificate will auto-renew daily at 3 AM"
    else
      echo "✓ Cron job already exists"
    fi

    $DOCKER_CMD restart nginx || true
  else
    echo "Let's Encrypt certificate still not present after $max_attempts attempts; retaining self-signed cert."
  fi
fi

# ---------------------------------------------------------------------------
# Secondary certificate chain verification (non-blocking)
# ---------------------------------------------------------------------------
echo "Verifying presented TLS certificate chain..."
if command -v openssl >/dev/null 2>&1; then
  CERT_INFO=$(echo | openssl s_client -connect fakefourrecords.com:443 -servername fakefourrecords.com -showcerts 2>/dev/null | openssl x509 -noout -issuer -subject || true)
  if [ -n "$CERT_INFO" ]; then
    echo "--- Certificate Info ---"
    echo "$CERT_INFO"
    SELF_SIGNED=0
    if echo "$CERT_INFO" | grep -qi "issuer=.*fakefourrecords.com"; then
      echo "NOTE: Self-signed certificate still in use (issuer matches domain)."
      SELF_SIGNED=1
    fi
    if [ "$SELF_SIGNED" -eq 1 ] && [ "${REQUIRE_TRUSTED_CERT:-false}" = "true" ]; then
      echo "REQUIRE_TRUSTED_CERT=true and self-signed certificate detected; failing deploy."
      exit 1
    fi
  else
    echo "WARNING: Unable to retrieve certificate info via openssl."
  fi
else
  echo "openssl not available; skipping certificate chain verification."
fi

# ---------------------------------------------------------------------------
# Persist digest audit log
# ---------------------------------------------------------------------------
cat > .deploy/digests.json <<JSON
{
  "website": {
    "prev": "${PREV_WEBSITE_DIGEST}",
    "current": "${NEW_WEBSITE_DIGEST}"
  },
  "nginx": {
    "prev": "${PREV_NGINX_DIGEST}",
    "current": "${NEW_NGINX_DIGEST}"
  }
}
JSON

$DOCKER_CMD system prune -f || true
