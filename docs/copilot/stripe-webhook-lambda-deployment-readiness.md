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

### Step 2: Store all 9 SSM parameters

Run these from your terminal (AWS CLI is already installed). Replace placeholder values with real ones:

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
```

The webhook-secret is a placeholder for now — you'll get the real value from Stripe after the first deploy (Step 6).

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

1. Go to **dashboard.stripe.com → Developers → Webhooks → Add endpoint**
2. Set **Endpoint URL** to the `WebhookUrl` from Step 6
3. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `charge.refunded`
4. Click **Add endpoint**
5. **Reveal** the signing secret (`whsec_...`) and update SSM:

```bash
aws ssm put-parameter \
  --name /fakefour/stripe/webhook-secret \
  --value "whsec_..." \
  --type SecureString \
  --overwrite
```

6. Trigger a redeploy (trivial commit or manual workflow dispatch) so Lambda picks up the real secret.

### Step 8: Test end-to-end

```bash
# Send a test event to the live endpoint
stripe trigger checkout.session.completed \
  --webhook-endpoint https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/production/webhooks/stripe

# Tail Lambda logs
sam logs --name StripeWebhookFunction --stack-name fakefour-stripe-webhook --tail
# Or: AWS Console → CloudWatch → Log groups → /aws/lambda/fakefour-stripe-webhook-*
```

### Step 9: Decide what to do with the existing Next.js webhook handler

The handler at `src/app/api/stripe/webhook/route.ts` still exists. Options:

- **Keep both temporarily** — point Stripe at the Lambda, keep the Next.js route as a fallback until you're confident
- **Remove the Next.js route** — delete `src/app/api/stripe/webhook/route.ts` once Lambda is proven in production

---

## Troubleshooting

| Symptom                                     | Likely cause                               | Fix                                                                                                  |
| ------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `400 Webhook signature verification failed` | Body was parsed before `constructEvent`    | Ensure `event.body` is passed as-is (raw string)                                                     |
| `No handler found for runtime nodejs24.x`   | SAM CLI version too old                    | `brew upgrade aws-sam-cli`                                                                           |
| Prisma engine not found at runtime          | Wrong binary in layer                      | Confirm `linux-arm64-openssl-3.0.x` binary is in `layers/prisma/nodejs/node_modules/.prisma/client/` |
| GitHub Actions OIDC error                   | Trust policy condition mismatch            | Check `braveneworg/boudreaux` matches exactly in the trust policy                                    |
| `placeholder` webhook secret in SSM         | Forgot to update after Stripe registration | Run the `aws ssm put-parameter --overwrite` command from Step 7                                      |
| SES `AccessDenied`                          | Missing IAM policy                         | Verify `template.yaml` has the `ses:SendEmail` policy on the function                                |
| MongoDB connection refused                  | Atlas IP allowlist blocking Lambda         | Add `0.0.0.0/0` to Atlas IP Access List or use VPC                                                   |
