# Stripe Webhook Lambda — Deployment Readiness Plan

## Context

The Lambda code is implemented and passes TypeScript compilation, lint, and the main app test suite. Before the Lambda can actually work in production, there are **code fixes** (now applied) and **manual AWS/Stripe/GitHub steps** you must perform. This document separates the two.

---

## Part A — Code fixes (applied)

### 1. Moved the GitHub Actions workflow to the repo root

**Problem:** GitHub Actions only discovers workflows in `<repo-root>/.github/workflows/`. The file at `stripe-webhook/.github/workflows/deploy-stripe-webhook.yml` would never execute from its original location.

**Fix:** Moved to `.github/workflows/deploy-stripe-webhook.yml` (alongside `ci.yml` and `deploy.yml`). Deleted `stripe-webhook/.github/`.

### 2. Added `--capabilities CAPABILITY_IAM` to `sam deploy`

**Problem:** SAM creates an implicit IAM execution role for the Lambda function. Without `--capabilities CAPABILITY_IAM`, a fresh deployment fails with a changeset error.

**Fix:** Added the flag to the `sam deploy` command in the workflow.

### 3. Added SES send permission to the Lambda execution role

**Problem:** The SAM template creates an implicit execution role for the Lambda, but that role had no SES permissions. Email sends would fail with `AccessDenied`.

**Fix:** Added an inline policy to the function in `template.yaml`:

```yaml
Policies:
  - Statement:
      - Effect: Allow
        Action:
          - ses:SendEmail
        Resource: '*'
```

---

## Part B — Manual steps you must perform (checklist)

These are infrastructure/service configuration steps that require your credentials and cannot be automated.

### Step 1: Install SAM CLI locally (optional but recommended for testing)

```bash
brew install aws-sam-cli
```

SAM CLI is **not** required for the CI/CD deploy (GitHub Actions installs it), but it allows local `sam build` / `sam local invoke` testing.

### Step 2: Store all 10 SSM parameters

**Option A — Use the helper script (recommended):**

```bash
# Interactive mode (prompts for each value):
./scripts/setup-ssm-params.sh

# From an .env-style file:
./scripts/setup-ssm-params.sh --file .env.lambda

# Overwrite existing parameters:
./scripts/setup-ssm-params.sh --overwrite
```

**Option B — Manual CLI commands:**

```bash
# Already may exist (check first with: aws ssm get-parameter --name /fakefour/stripe/secret-key)
aws ssm put-parameter --name /fakefour/stripe/secret-key       --value "sk_live_..." --type SecureString
aws ssm put-parameter --name /fakefour/stripe/webhook-secret    --value "placeholder" --type SecureString
aws ssm put-parameter --name /fakefour/database-url             --value "mongodb+srv://..." --type SecureString
aws ssm put-parameter --name /fakefour/email-from               --value "noreply@fakefourrecords.com" --type SecureString
aws ssm put-parameter --name /fakefour/base-url                 --value "https://fakefourrecords.com" --type String
aws ssm put-parameter --name /fakefour/stripe/price-minimum     --value "price_..." --type String
aws ssm put-parameter --name /fakefour/stripe/price-extra       --value "price_..." --type String
aws ssm put-parameter --name /fakefour/stripe/price-extra-extra --value "price_..." --type String
aws ssm put-parameter --name /fakefour/aws-ses-region           --value "us-east-1" --type String
aws ssm put-parameter --name /fakefour/ses-identity-arn         --value "arn:aws:ses:us-east-1:ACCOUNT_ID:identity/fakefourrecords.com" --type String
```

The webhook-secret is a placeholder for now — you'll get the real value from Stripe after the first deploy (Step 6). The SES identity ARN is used in the Lambda's IAM policy to scope `ses:SendEmail` permissions.

### Step 3: Set up GitHub OIDC in AWS (one-time per AWS account)

**Create the OIDC identity provider** (skip if already done for other workflows):

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

**Create the trust policy** — save as `github-deploy-trust.json`: (and delete file later after aws iam create-role command)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:braveneworg/boudreaux:*"
        },
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
```

**Create the IAM role and attach policies:**

```bash
aws iam create-role \
  --role-name GitHubActionsDeployRole \
  --assume-role-policy-document file://github-deploy-trust.json

aws iam attach-role-policy --role-name GitHubActionsDeployRole \
  --policy-arn arn:aws:iam::aws:policy/AWSCloudFormationFullAccess
aws iam attach-role-policy --role-name GitHubActionsDeployRole \
  --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess
aws iam attach-role-policy --role-name GitHubActionsDeployRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonAPIGatewayAdministrator
aws iam attach-role-policy --role-name GitHubActionsDeployRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess
aws iam attach-role-policy --role-name GitHubActionsDeployRole \
  --policy-arn arn:aws:iam::aws:policy/IAMFullAccess

# CloudWatch alarm management (for RefreshIpAllowlistErrorAlarm and any future alarms)
aws iam put-role-policy \
  --role-name GitHubActionsDeployRole \
  --policy-name CloudWatchAlarms \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricAlarm",
        "cloudwatch:DeleteAlarms",
        "cloudwatch:DescribeAlarms",
        "cloudwatch:TagResource",
        "cloudwatch:UntagResource",
        "cloudwatch:ListTagsForResource"
      ],
      "Resource": "*"
    }]
  }'

# EventBridge rule management (for the Schedule event on RefreshIpAllowlistFunction)
aws iam put-role-policy \
  --role-name GitHubActionsDeployRole \
  --policy-name EventBridgeRules \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "events:PutRule",
        "events:DeleteRule",
        "events:DescribeRule",
        "events:PutTargets",
        "events:RemoveTargets",
        "events:ListTargetsByRule",
        "events:TagResource",
        "events:UntagResource",
        "events:ListTagsForResource"
      ],
      "Resource": "*"
    }]
  }'
```

Get the role ARN:

```bash
aws iam get-role --role-name GitHubActionsDeployRole --query 'Role.Arn' --output text
```

### Step 4: Add the role ARN to GitHub repo secrets

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Name                  | Value                                                       |
| --------------------- | ----------------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::YOUR_ACCOUNT_ID:role/GitHubActionsDeployRole` |

### Step 5: Ensure MongoDB Atlas allows Lambda connections

Either:

- Add `0.0.0.0/0` to the Atlas IP Access List (simplest for Lambda, since IPs are dynamic), **or**
- Deploy the Lambda into a VPC with a NAT Gateway and allowlist the NAT Gateway's Elastic IP

### Step 6: First deploy — merge to main

Merge the `stripe-webhook/` changes into `main`. GitHub Actions will build and deploy the stack. After it succeeds, get the webhook URL:

-- you are WAITING HERE for the deployment to complete before running this command --

```bash
aws cloudformation describe-stacks \
  --stack-name fakefour-stripe-webhook \
  --query 'Stacks[0].Outputs'
```

### Step 7: Register the webhook in Stripe

1. Go to **dashboard.stripe.com → Developers → Webhooks → Add destination**
2. Select **Webhook** as the destination type
3. Set **Endpoint URL** to the `WebhookUrl` from Step 6
4. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `charge.refunded`
5. Click **Create destination**
6. **Reveal** the signing secret (`whsec_...`) and update SSM:

```bash
aws ssm put-parameter \
  --name /fakefour/stripe/webhook-secret \
  --value "whsec_..." \
  --type SecureString \
  --overwrite
```

7. Trigger a redeploy (trivial commit or manual workflow dispatch) so Lambda picks up the real secret.

### Step 8: Test end-to-end

```bash
# Send a test event to the live endpoint
stripe trigger checkout.session.completed \
  --webhook-endpoint https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/production/webhooks/stripe

# Tail Lambda logs (sam logs has a known bug with custom StageName — use AWS CLI instead)
aws logs tail /aws/lambda/fakefour-stripe-webhook-StripeWebhookFunction-XXXX --follow
# To find the exact log group name:
#   aws logs describe-log-groups --log-group-name-prefix /aws/lambda/fakefour-stripe-webhook
# Or: AWS Console → CloudWatch → Log groups → /aws/lambda/fakefour-stripe-webhook-*
```

### Step 9: Next.js webhook route — dev-only gating (done)

The handler at `src/app/api/stripe/webhook/route.ts` is now **gated to development only**. In production (`NODE_ENV === 'production'`), it returns 404. This means:

- **Local dev:** The route works normally with `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- **Production:** The route returns 404. Only the Lambda handles live Stripe webhooks.

No manual action required — the code change is already applied.

### Step 10: Bootstrap the Stripe IP allowlist refresh Lambda

The SAM template includes a second Lambda (`RefreshIpAllowlistFunction`) that fetches `https://stripe.com/files/ips/ips_webhooks.json` on a daily schedule and writes the result to `/fakefour/stripe/webhook-ip-ranges`. Stripe does not warn before rotating IPs, so this keeps the webhook Lambda's allowlist current without manual intervention.

After the first deployment, invoke it once manually so the parameter is populated immediately instead of waiting up to 24 hours for the first schedule tick:

```bash
# Find the deployed function name
aws lambda list-functions \
  --query "Functions[?contains(FunctionName, 'RefreshIpAllowlist')].FunctionName" \
  --output text

# Invoke it (replace with the name from above)
aws lambda invoke \
  --function-name fakefour-stripe-webhook-RefreshIpAllowlistFunction-XXXX \
  --log-type Tail \
  --query 'LogResult' --output text /tmp/refresh-out.json | base64 -d

# Confirm the parameter is populated
aws ssm get-parameter --name /fakefour/stripe/webhook-ip-ranges --query 'Parameter.Value' --output text
```

The CloudWatch alarm `RefreshIpAllowlistErrorAlarm` fires if the refresh function errors for two consecutive days. By default it has no `AlarmActions` — wire it to an SNS topic (or remove the alarm) to actually get paged.

---

## Troubleshooting

| Symptom                                                    | Likely cause                                     | Fix                                                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400 Webhook signature verification failed`                | Body was parsed before `constructEvent`          | Ensure `event.body` is passed as-is (raw string)                                                                                                                       |
| `No handler found for runtime nodejs24.x`                  | SAM CLI version too old                          | `brew upgrade aws-sam-cli`                                                                                                                                             |
| Prisma engine not found at runtime                         | Wrong binary in layer                            | Confirm `linux-arm64-openssl-3.0.x` binary is in `layers/prisma/nodejs/node_modules/.prisma/client/`                                                                   |
| GitHub Actions OIDC error                                  | Trust policy condition mismatch                  | Check `braveneworg/boudreaux` matches exactly in the trust policy                                                                                                      |
| `placeholder` webhook secret in SSM                        | Forgot to update after Stripe registration       | Run the `aws ssm put-parameter --overwrite` command from Step 7                                                                                                        |
| SES `AccessDenied`                                         | Missing IAM policy                               | Verify `template.yaml` has the `ses:SendEmail` policy on the function                                                                                                  |
| MongoDB connection refused                                 | Atlas IP allowlist blocking Lambda               | Add `0.0.0.0/0` to Atlas IP Access List or use VPC                                                                                                                     |
| `sam logs` → `NotFoundException: Invalid stage identifier` | SAM CLI bug with custom `StageName` on `HttpApi` | Use `aws logs tail /aws/lambda/fakefour-stripe-webhook-StripeWebhookFunction-XXXX --follow` or `sam logs --cw-log-group <log-group> --tail` to bypass stage resolution |
