# Fixing GitHub Actions SSH Timeout to EC2

## Diagnosis Steps

### Step 1: Check EC2 Security Group Settings

1. Go to AWS Console → EC2 → Instances
2. Click on your instance
3. Click on the "Security" tab
4. Click on the Security Group name (e.g., `sg-xxxxx`)
5. Check the "Inbound rules"

**Required Rule:**

- **Type**: SSH
- **Protocol**: TCP
- **Port**: 22
- **Source**: `0.0.0.0/0` (allow from anywhere)
  - OR use GitHub's IP ranges: https://api.github.com/meta (look for `actions` IPs)

**To add the rule:**

1. Click "Edit inbound rules"
2. Click "Add rule"
3. Type: SSH
4. Source: `0.0.0.0/0` (or Anywhere-IPv4)
5. Click "Save rules"

### Step 2: Verify EC2 Instance is Running

1. AWS Console → EC2 → Instances
2. Check instance state is **Running** (not stopped or terminated)
3. Note the **Public IPv4 address** or **Elastic IP**

### Step 3: Verify GitHub Secrets are Correct

Go to GitHub: `https://github.com/braveneworg/boudreaux/settings/secrets/actions`

Check these secrets:

1. **AWS_EC2_IP_ADDRESS**
   - Should match your EC2's Public IP or Elastic IP
   - No spaces, no protocol (just the IP: `1.2.3.4`)

2. **AWS_HOST_USER**
   - For Ubuntu AMI: `ubuntu`
   - For Amazon Linux: `ec2-user`
   - For other AMIs: check AMI documentation

3. **PRIVATE_KEY**
   - Must be the **private key** from your EC2 key pair (`.pem` file)
   - Should start with `-----BEGIN RSA PRIVATE KEY-----` or `-----BEGIN OPENSSH PRIVATE KEY-----`
   - Should end with `-----END RSA PRIVATE KEY-----` or `-----END OPENSSH PRIVATE KEY-----`
   - Include the BEGIN and END lines
   - No extra spaces or newlines at start/end

### Step 4: Test SSH Connection Locally

From your local machine, test if you can SSH to EC2:

```bash
ssh -i ~/.ssh/your-key.pem ubuntu@YOUR_EC2_IP "echo 'Connection successful'"
```

If this fails, the issue is with your EC2 configuration, not GitHub Actions.

### Step 5: Run Test SSH Workflow

I created a test workflow file: `.github/workflows/test-ssh.yml`

To run it:

1. Commit and push: `git add .github/workflows/test-ssh.yml && git commit -m "Add SSH test workflow" && git push`
2. Go to GitHub Actions: `https://github.com/braveneworg/boudreaux/actions`
3. Click on "Test SSH Connection" workflow
4. Click "Run workflow" button
5. Check the logs for details about the SSH failure

## Common Solutions

### Solution 1: Open SSH Port in Security Group (Most Common)

```bash
# Get your security group ID
aws ec2 describe-instances --instance-ids YOUR_INSTANCE_ID --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId'

# Add SSH rule allowing all IPs
aws ec2 authorize-security-group-ingress \
  --group-id YOUR_SECURITY_GROUP_ID \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0
```

### Solution 2: Use GitHub Actions IP Ranges (More Secure)

If you want to restrict to GitHub IPs only:

1. Get GitHub IP ranges: https://api.github.com/meta
2. Look for `actions` array
3. Add each IP range to your security group

**Note:** GitHub's IPs change, so `0.0.0.0/0` is easier for SSH.

### Solution 3: Fix Private Key Format

If your private key has issues:

```bash
# Check your local key works
ssh -i ~/.ssh/your-key.pem ubuntu@YOUR_EC2_IP echo "test"

# If it works locally, copy the EXACT contents to GitHub Secret
cat ~/.ssh/your-key.pem
# Copy ALL output including BEGIN/END lines
```

### Solution 4: Add Connection Timeout Options

Update the SSH command in `deploy.yml`:

```yaml
ssh -i /tmp/temp_key \
-o StrictHostKeyChecking=no \
-o ConnectTimeout=30 \
-o ServerAliveInterval=60 \
-o ServerAliveCountMax=3 \
${{secrets.AWS_HOST_USER}}@${{ secrets.AWS_EC2_IP_ADDRESS }} \
"your commands here"
```

## Verification

After making changes, test:

1. Trigger the test workflow: `.github/workflows/test-ssh.yml`
2. If test succeeds, trigger main deployment
3. Check GitHub Actions logs for any remaining errors

## Alternative: Manual Deployment

While fixing SSH, you can manually deploy:

```bash
# SSH to EC2
ssh -i ~/.ssh/your-key.pem ubuntu@YOUR_EC2_IP

# Pull latest images
sudo docker pull ghcr.io/braveneworg/boudreaux/website:latest
sudo docker pull ghcr.io/braveneworg/boudreaux/nginx:latest

# Restart containers
sudo docker compose -f docker-compose.prod.yml down
sudo docker compose -f docker-compose.prod.yml up -d

# Verify
sudo docker ps
curl http://localhost/api/health
```

## Need Help?

If issues persist, check:

1. AWS CloudWatch logs for EC2
2. `/var/log/auth.log` on EC2 for SSH connection attempts
3. GitHub Actions logs for detailed error messages
