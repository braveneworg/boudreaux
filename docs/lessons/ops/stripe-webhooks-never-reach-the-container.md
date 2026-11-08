# Stripe webhooks never reach the container in production

Production Stripe webhooks go to the `fakefour-stripe-webhook` Lambda
(`stripe-webhook/template.yaml`, API Gateway `/webhooks/stripe`), not to
the website. The Next.js route `src/app/api/stripe/webhook/route.ts`
returns 404 when `NODE_ENV` is `production`; it exists for local
`stripe listen` testing only.

The Lambda keeps its own source-IP allowlist: it reads
`/fakefour/stripe/webhook-ip-ranges` from SSM on every invocation, and
`RefreshIpAllowlistFunction` rewrites that parameter from
`https://stripe.com/files/ips/ips_webhooks.json` once a day. API
Gateway's `sourceIp` is the TCP peer, so it cannot be spoofed.

The 2026-11-05 architecture review missed this. It traced
`STRIPE_WEBHOOK_IP_RANGES` from the GitHub secret to `checkIpAllowlist`
and claimed "the webhook IP allowlist is off in prod". That call-site
path was real, but it ran through a route that production never serves.
PR #933 then warned that forwarding the secret "turns the allowlist on
in production" and that stale ranges would 403 Stripe. Neither was true.
On 2026-11-08 the user asked for a server cron to keep the ranges fresh,
and the daily Lambda refresh had been doing exactly that since October.

Rules:

- Start a call-site proof at the production entry point, not at the
  function. Read the handler's early returns (`NODE_ENV` guards, feature
  gates) and ask what production traffic actually reaches it.
- For anything Stripe-webhook shaped, read `stripe-webhook/` first. The
  container route is a development stand-in.
- Before claiming a production defect, check the deployed path when you
  can do so read-only: `aws cloudformation describe-stack-resources`, or
  the function's CloudWatch logs.
