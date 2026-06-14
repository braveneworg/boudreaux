# Better Deployment Options for EC2

## Current Problem

GitHub Actions SSH timeout makes deployment unreliable. SSH from dynamic GitHub IPs to EC2 is fragile.

## Recommended Solutions (Best to Good)

### 🥇 Option 1: Self-Hosted GitHub Actions Runner (BEST)

**Run a GitHub Actions runner directly on your EC2 instance**

**Pros:**

- No SSH needed - runner already on EC2
- No security group changes needed
- Fast deployments (local docker commands)
- Reliable and secure
- Free for self-hosted runners

**Cons:**

- Requires setup of runner on EC2

**Implementation:**

1. SSH to EC2 once to install runner:

```bash
# On EC2
cd /home/ubuntu
mkdir actions-runner && cd actions-runner

# Download latest runner
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz

tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Configure (get token from GitHub repo Settings > Actions > Runners > New self-hosted runner)
./config.sh --url https://github.com/braveneworg/boudreaux --token YOUR_TOKEN

# Install as service
sudo ./svc.sh install
sudo ./svc.sh start
```

2. Update `.github/workflows/deploy.yml`:

```yaml
deploy:
  name: Deploy to AWS EC2
  runs-on: self-hosted # Changed from ubuntu-latest
  needs: build
  steps:
    - name: Pull and deploy images
      run: |
        cd /home/ubuntu/boudreaux  # Your app directory
        docker compose -f docker-compose.prod.yml pull
        docker compose -f docker-compose.prod.yml up -d --remove-orphans
        docker system prune -f
```

**This is the simplest and most reliable solution for your use case.**

---

### 🥈 Option 2: AWS Systems Manager (SSM) Session Manager

**Use AWS SSM instead of SSH**

**Pros:**

- No SSH, no open port 22
- Works through AWS infrastructure
- More secure than SSH
- No IP whitelist needed

**Cons:**

- Requires IAM setup
- Requires SSM agent on EC2 (usually pre-installed)

**Implementation:**

1. Attach IAM role to EC2 with `AmazonSSMManagedInstanceCore` policy
2. Update workflow to use AWS SSM:

```yaml
- name: Deploy via AWS SSM
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    AWS_REGION: ${{ secrets.AWS_REGION }}
  run: |
    # Install AWS CLI
    aws --version || (curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \
                      unzip awscliv2.zip && \
                      sudo ./aws/install)

    # Send commands via SSM
    aws ssm send-command \
      --instance-ids "i-YOUR-INSTANCE-ID" \
      --document-name "AWS-RunShellScript" \
      --parameters 'commands=[
        "cd /home/ubuntu/boudreaux",
        "docker compose -f docker-compose.prod.yml pull",
        "docker compose -f docker-compose.prod.yml up -d --remove-orphans",
        "docker system prune -f"
      ]' \
      --region ${{ secrets.AWS_REGION }}
```

---

### 🥉 Option 3: GitHub Actions with GitHub IP Ranges

**Fix SSH by whitelisting GitHub's IP ranges**

**Pros:**

- Minimal changes to current setup
- More secure than 0.0.0.0/0

**Cons:**

- GitHub IPs can change (need to maintain)
- Still relies on SSH
- More complex security group rules

**Implementation:**

1. Get GitHub's IP ranges from: https://api.github.com/meta
2. Add all `actions` IPs to EC2 security group port 22
3. Keep current workflow

**Note:** This is fragile because GitHub can add new IP ranges.

---

### 🏅 Option 4: Webhook-Based Deployment

**EC2 pulls changes instead of GitHub pushing**

**Pros:**

- No SSH from GitHub
- EC2 initiates connection (easier networking)
- Simple webhook endpoint

**Cons:**

- Requires web server on EC2 for webhook
- Need to secure webhook endpoint

**Implementation:**

1. Create webhook listener on EC2:

```javascript
// deploy-webhook.js on EC2
const express = require('express');
const crypto = require('crypto');
const { exec } = require('child_process');

const app = express();
app.use(express.json());

const SECRET = process.env.WEBHOOK_SECRET;

app.post('/deploy', (req, res) => {
  // Verify GitHub signature
  const signature = req.headers['x-hub-signature-256'];
  const hash = `sha256=${crypto.createHmac('sha256', SECRET).update(JSON.stringify(req.body)).digest('hex')}`;

  if (signature === hash) {
    exec(
      'cd /home/ubuntu/boudreaux && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d',
      (error, stdout, stderr) => {
        if (error) {
          console.error(error);
          return res.status(500).send('Deployment failed');
        }
        res.send('Deployed successfully');
      }
    );
  } else {
    res.status(401).send('Unauthorized');
  }
});

app.listen(9000, () => console.log('Webhook listening on port 9000'));
```

2. Configure GitHub webhook in repo settings to call `https://your-ec2-ip:9000/deploy`

---

### ❌ Option 5: Open SSH to 0.0.0.0/0 (NOT RECOMMENDED)

**Allow SSH from any IP**

**Pros:**

- Quick fix
- Works immediately

**Cons:**

- **Security risk** - exposes SSH to internet
- Subject to brute force attacks
- Not recommended for production

**If you must:**

1. AWS Console → EC2 → Security Groups
2. Add inbound rule: Type=SSH, Port=22, Source=0.0.0.0/0
3. Enable fail2ban and strong authentication

---

## My Recommendation

**Use Option 1: Self-Hosted Runner**

It's the easiest, most reliable, and secure option for your setup. Here's why:

1. **One-time setup** - Install runner once on EC2
2. **Fast** - No network latency between GitHub and EC2
3. **Reliable** - No SSH connection issues
4. **Secure** - No open SSH port, runner authenticates with GitHub
5. **Free** - Self-hosted runners don't count against GitHub Actions minutes
6. **Simple** - Deployment becomes just local docker commands

### Quick Implementation Steps:

1. **On EC2 (one time):**

```bash
ssh -i ~/.ssh/your-key.pem ubuntu@your-ec2-ip

# Install runner
cd ~
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Get token from: https://github.com/braveneworg/boudreaux/settings/actions/runners/new
./config.sh --url https://github.com/braveneworg/boudreaux --token YOUR_REGISTRATION_TOKEN

# Install as service
sudo ./svc.sh install
sudo ./svc.sh start

# Verify
sudo ./svc.sh status
```

2. **Update `.github/workflows/deploy.yml`:**

```yaml
deploy:
  name: Deploy to AWS EC2
  runs-on: self-hosted # 👈 Only change this line
  needs: build
  if: github.ref == 'refs/heads/main'
  steps:
    - name: Deploy images
      run: |
        cd /home/ubuntu/boudreaux

        # Login to GitHub Container Registry
        echo "${{ secrets.PERSONAL_ACCESS_TOKEN }}" | docker login ghcr.io -u ${{ secrets.NAMESPACE }} --password-stdin

        # Pull latest images
        docker compose -f docker-compose.prod.yml pull

        # Deploy
        docker compose -f docker-compose.prod.yml up -d --remove-orphans

        # Cleanup
        docker logout
        docker system prune -f
```

That's it! No more SSH issues, no security group changes, no complex networking.

---

## Additional Resources

- [GitHub Self-Hosted Runners Docs](https://docs.github.com/en/actions/hosting-your-own-runners)
- [AWS SSM Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)
- [GitHub Webhook Events](https://docs.github.com/en/webhooks-and-events/webhooks/webhook-events-and-payloads)
