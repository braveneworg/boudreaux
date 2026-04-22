#!/bin/bash

# Setup AWS SSM Parameter Store parameters for the Stripe webhook Lambda.
# Usage:
#   Interactive:  ./scripts/setup-ssm-params.sh
#   From file:    ./scripts/setup-ssm-params.sh --file .env.lambda
#   Overwrite:    ./scripts/setup-ssm-params.sh --overwrite
#   Help:         ./scripts/setup-ssm-params.sh --help
#
# The .env file format is KEY=VALUE, one per line. Expected keys:
#   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, DATABASE_URL, EMAIL_FROM,
#   BASE_URL, STRIPE_PRICE_MINIMUM, STRIPE_PRICE_EXTRA,
#   STRIPE_PRICE_EXTRA_EXTRA, AWS_SES_REGION, SES_IDENTITY_ARN,
#   STRIPE_WEBHOOK_IP_RANGES

set -euo pipefail

OVERWRITE=""
ENV_FILE=""
AWS_REGION="${AWS_REGION:-us-east-1}"

usage() {
  cat <<'EOF'
Usage: setup-ssm-params.sh [OPTIONS]

Options:
  --file <path>     Read values from an .env-style file (KEY=VALUE per line)
  --overwrite       Overwrite existing SSM parameters
  --region <region> AWS region (default: us-east-1 or $AWS_REGION)
  --help            Show this help message

Interactive mode prompts for each value. Sensitive values are read with
-s (hidden input). A .env file skips the prompts entirely.

Required .env keys:
  STRIPE_SECRET_KEY        Stripe live secret key (sk_live_...)
  STRIPE_WEBHOOK_SECRET    Stripe webhook signing secret (whsec_...)
  DATABASE_URL             MongoDB connection string
  EMAIL_FROM               SES verified sender email
  BASE_URL                 Production base URL (https://...)
  STRIPE_PRICE_MINIMUM     Stripe price ID for minimum tier
  STRIPE_PRICE_EXTRA       Stripe price ID for extra tier
  STRIPE_PRICE_EXTRA_EXTRA Stripe price ID for extra-extra tier
  AWS_SES_REGION           AWS region for SES (e.g., us-east-1)
  SES_IDENTITY_ARN         SES identity ARN for IAM policy
  STRIPE_WEBHOOK_IP_RANGES Comma-separated list of Stripe webhook IP CIDR ranges
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      ENV_FILE="$2"
      shift 2
      ;;
    --overwrite)
      OVERWRITE="--overwrite"
      shift
      ;;
    --region)
      AWS_REGION="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# Verify AWS CLI is available
if ! command -v aws &> /dev/null; then
  echo "Error: AWS CLI is not installed. Install it first:" >&2
  echo "  brew install awscli" >&2
  exit 1
fi

# Verify AWS credentials
if ! aws sts get-caller-identity --region "$AWS_REGION" &> /dev/null; then
  echo "Error: AWS credentials not configured or expired." >&2
  echo "  Run: aws configure" >&2
  exit 1
fi

# Read a value from the .env file or prompt interactively
# Usage: read_value VAR_NAME "Prompt text" [secret]
read_value() {
  local var_name="$1"
  local prompt_text="$2"
  local is_secret="${3:-}"
  local value

  # Check .env file first
  if [[ -n "$ENV_FILE" ]]; then
    value=$(grep -E "^${var_name}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2-)
    # Strip surrounding quotes if present
    value="${value#\"}"
    value="${value%\"}"
    value="${value#\'}"
    value="${value%\'}"
    if [[ -z "$value" ]]; then
      echo "Error: missing required key '${var_name}' in ${ENV_FILE}" >&2
      exit 1
    fi
    echo "$value"
    return
  fi

  # Interactive prompt
  if [[ "$is_secret" == "secret" ]]; then
    read -rsp "$prompt_text: " value
    echo >&2  # newline after hidden input
  else
    read -rp "$prompt_text: " value
  fi
  echo "$value"
}

# Put a parameter into SSM
# Usage: put_param "/path/name" "value" "String|SecureString"
put_param() {
  local name="$1"
  local value="$2"
  local type="$3"

  if [[ -z "$value" ]]; then
    echo "  SKIPPED $name (empty value)" >&2
    return 1
  fi

  local err
  if err=$(aws ssm put-parameter \
    --name "$name" \
    --value "$value" \
    --type "$type" \
    --region "$AWS_REGION" \
    $OVERWRITE 2>&1 >/dev/null); then
    echo "  OK $name ($type)"
  else
    echo "  FAILED $name — parameter may already exist (use --overwrite to update)" >&2
    echo "  Error: $err" >&2
    return 1
  fi
}

# Validate .env file exists if specified
if [[ -n "$ENV_FILE" && ! -f "$ENV_FILE" ]]; then
  echo "Error: File not found: $ENV_FILE" >&2
  exit 1
fi

echo "=== Stripe Webhook Lambda — SSM Parameter Setup ==="
echo "Region: $AWS_REGION"
if [[ -n "$ENV_FILE" ]]; then
  echo "Source: $ENV_FILE"
else
  echo "Mode:   Interactive"
fi
if [[ -n "$OVERWRITE" ]]; then
  echo "        (overwrite mode enabled)"
fi
echo ""

# Collect all values
STRIPE_SECRET_KEY=$(read_value "STRIPE_SECRET_KEY" "Stripe live secret key (sk_live_...)" secret)
STRIPE_WEBHOOK_SECRET=$(read_value "STRIPE_WEBHOOK_SECRET" "Stripe webhook secret (whsec_... or 'placeholder')" secret)
DATABASE_URL=$(read_value "DATABASE_URL" "MongoDB connection string" secret)
EMAIL_FROM=$(read_value "EMAIL_FROM" "SES sender email address")
BASE_URL=$(read_value "BASE_URL" "Production base URL (e.g., https://fakefourrecords.com)")
STRIPE_PRICE_MINIMUM=$(read_value "STRIPE_PRICE_MINIMUM" "Stripe price ID — minimum tier (price_...)")
STRIPE_PRICE_EXTRA=$(read_value "STRIPE_PRICE_EXTRA" "Stripe price ID — extra tier (price_...)")
STRIPE_PRICE_EXTRA_EXTRA=$(read_value "STRIPE_PRICE_EXTRA_EXTRA" "Stripe price ID — extra-extra tier (price_...)")
SES_REGION=$(read_value "AWS_SES_REGION" "AWS SES region (e.g., us-east-1)")
SES_IDENTITY_ARN=$(read_value "SES_IDENTITY_ARN" "SES identity ARN (arn:aws:ses:...)")
STRIPE_WEBHOOK_IP_RANGES=$(read_value "STRIPE_WEBHOOK_IP_RANGES" "Stripe webhook IP CIDR ranges (comma-separated)")

# Strip any surrounding quotes / whitespace from each comma-separated entry.
# Users often paste a JSON-style list like "1.2.3.4","5.6.7.8" — the Lambda
# expects bare comma-separated values and rejects quoted entries as invalid IPs.
STRIPE_WEBHOOK_IP_RANGES=$(echo "$STRIPE_WEBHOOK_IP_RANGES" | tr -d '"' | tr -d "'" | tr -d ' ')

echo ""
echo "--- Pushing parameters to SSM ---"
echo ""

SUCCESS=0
FAIL=0

push() {
  if put_param "$1" "$2" "$3"; then
    SUCCESS=$((SUCCESS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
}

push "/fakefour/stripe/secret-key"        "$STRIPE_SECRET_KEY"      "SecureString"
push "/fakefour/stripe/webhook-secret"     "$STRIPE_WEBHOOK_SECRET"  "SecureString"
push "/fakefour/database-url"              "$DATABASE_URL"           "SecureString"
push "/fakefour/email-from"                "$EMAIL_FROM"             "String"
push "/fakefour/base-url"                  "$BASE_URL"               "String"
push "/fakefour/stripe/price-minimum"      "$STRIPE_PRICE_MINIMUM"   "String"
push "/fakefour/stripe/price-extra"        "$STRIPE_PRICE_EXTRA"     "String"
push "/fakefour/stripe/price-extra-extra"  "$STRIPE_PRICE_EXTRA_EXTRA" "String"
push "/fakefour/aws-ses-region"            "$SES_REGION"             "String"
push "/fakefour/ses-identity-arn"          "$SES_IDENTITY_ARN"       "String"
push "/fakefour/stripe/webhook-ip-ranges"  "$STRIPE_WEBHOOK_IP_RANGES" "String"

echo ""
echo "=== Done: $SUCCESS succeeded, $FAIL failed ==="

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
