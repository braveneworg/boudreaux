# Deployment Workflow Review and Proposal

This document reviews the existing workflows (`deploy.yml` and `deploy-2.yml`) and proposes a cleaner, reliable CI/CD pipeline that fixes the current deployment blockers (notably SSH timeouts) and aligns with best practices.

## Summary

- Current `deploy.yml` combines build + CDN sync + Docker publish + SSH deploy. Build is good; deploy has been failing due to SSH connectivity/timeouts.
<<<<<<< HEAD
- `deploy-2.yml` focuses on SSH-only deploy with temporary IP whitelisting. It compiles and uses appleboy actions, but assumes a non-container PM2/node process and `git pull` build on the server, which conflicts with our containerized architecture and GHCR images.
=======
- `deploy-2.yml` focuses on SSH-only deploy with temporary IP whitelisting. It uses appleboy actions, but assumes a non-container PM2/node process and `git pull` build on the server, which conflicts with our containerized architecture and GHCR images.
>>>>>>> main
- Proposal: keep the strong build job, push images to GHCR, and deploy via SSH with temporary IP allowlist, but run Docker Compose on EC2 to pull new images. Include a quick health check and proper cleanup. This is captured in the new `deploy-clean.yml`.

## Detailed Review

### deploy.yml (current)

Strengths:

- Uses modern action versions for checkout and setup-node.
- Builds Next.js with deterministic `npm ci` and uses a placeholder `DATABASE_URL`.
- Syncs CDN artifacts via `npm run sync:cdn:no-build` with AWS creds and invalidates CloudFront.
- Builds/pushes Docker images to GHCR with docker compose.
- Copies `.env` and `docker-compose.prod.yml` to EC2 and runs Compose there.

Issues / Risks:

- SSH deploy is brittle: raw `ssh` and `scp` with manual keyfile management; frequent timeouts.
- Installs Docker every run (slow, error-prone). No short SSH timeout to fail fast.
- Mixes GHCR auth using a personal token and `NAMESPACE` env; prefer GitHub token for GHCR when possible.
- No concurrency group; multiple pushes can race.
- No explicit health check after deploy.
- Some duplication of image naming across steps.

### deploy-2.yml

Strengths:

- Temporarily whitelists runner IP in the AWS Security Group, then revokes it (improves SSH reliability).
- Uses appleboy `ssh-action` to simplify SSH execution and avoid manual key files.

Issues / Risks:

- Assumes non-containerized deployment (`git pull`, `npm install`, `pm2 restart`), which does not match our container-based deployment strategy.
- Rebuilds on the EC2 host rather than pulling prebuilt images from GHCR.
- No CDN sync, no Docker usage, and no health check.

## Proposal: deploy-clean.yml

Highlights:

- Adds `concurrency` to prevent overlapping deploys.
- Keeps build job intact: Next build, CDN sync, GHCR push.
- Deploy job uses temporary SSH allowlisting and appleboy scp/ssh actions to transfer compose/env and run Docker Compose on EC2.
- Uses `docker/login-action@v3` for build-side login and GitHub token for GHCR registry operations.
- Performs a simple health check on `https://fakefourrecords.com/api/health` post-deploy to catch regressions.
- Cleans up unused images with `docker system prune -f`.

### Secrets Used

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`, `CDN_DOMAIN` for CDN sync.
- `GITHUB_TOKEN` for GHCR login (packages:write permission).
- `SSH_PRIVATE_KEY`, `EC2_HOST`, `EC2_USERNAME` for SSH/SCP.
- `AWS_SECURITY_GROUP_ID` for temporary IP allowlisting.
- App secrets: `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`, email and Turnstile secrets.

### Migration Notes

- Keep `deploy.yml` for now. Trial the new `deploy-clean.yml` on main merges. If stable, replace the old one.
- Ensure the EC2 instance has Docker preinstalled; the workflow includes an idempotent install path but it's faster to pre-provision.
- Consider moving TLS certs to AWS SSM Parameter Store or AWS Secrets Manager and fetch them on the instance rather than copying via workflow.

## Future Enhancements

- Move to a self-hosted runner on EC2 and run `docker compose up -d` locally without SSH.
- Replace SSH with AWS SSM Session Manager (no open port 22 needed) or AWS CodeDeploy/CodeBuild.
- Tag and deploy by immutable digests; keep a `previous` tag for quick rollback.
- Add canary/blue-green by running a second task or staging host; or health-check plus auto-rollback.
- Observability: push container logs to CloudWatch or use a lightweight agent.

## Acceptance Criteria

- New workflow builds successfully, pushes images, performs deploy, and health check passes.
- SSH step completes without timeouts thanks to temporary IP allowlist.
- CDN assets are updated/invalidate correctly.
- After deploy, /api/auth/session reflects the NGINX header fix (no 400s).
