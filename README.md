This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Purpose

To build and deploy a Next.js app with Docker, GitHub Container Registry, GitHub Actions, and AWS EC2.

## Set github secrets

- AWS_CERTIFICATE - the certificate exported ACM certificate in PEM format
- AWS_EC2_IP_ADDRESS - the public IP address of the EC2 instance (elastic IP recommended)
- AWS_HOST_USER - the SSH user for the EC2 instance (usually "ec2-user" or "ubuntu")
- AWS_PRIVATE_KEY - the private key for the EC2 instance, in PEM format
- NAMESPACE - arbitrary but should jive with your project name or effort
- NGINX_SERVER_NAME - the server_name directive for nginx (e.g. example.com or www.example.com)
- PERSONAL_ACCESS_TOKEN - a GitHub personal access token with `read:packages` and `write:packages` permissions
  runner.

# EC 2 instance setup

- Launch an EC2 instance (I used Ubuntu 24.04 LTS in this instance)
- Assign an elastic IP address to the instance
  How?
  - Go to EC2 Dashboard > Elastic IPs > Allocate Elastic IP address
  - Select the new elastic IP, then Actions > Associate Elastic IP address
  - Select your instance and associate
- Open port 22 (SSH), 80 (HTTP), and 443 (HTTPS)
  - How?
    - Go to EC2 Dashboard > Security Groups > Create Security Group
    - Add Inbound rules for SSH, HTTP, and HTTPS
    - Assign the security group to your EC2 instance
- Be sure to add ssh user to sudoers file
  `sudo usermod -aG sudo your-ssh-user`
- Also remove any password requirement for sudo
  `sudo passwd -d your-ssh-user`

## Publish to ghcr.io

```bash
docker build -t ghcr.io/org-or-user/repo-name/website .
docker push ghcr.io/org-or-user/repo-name/website
docker build -t ghcr.io/org-or-user/repo-name/nginx .
docker push ghcr.io/org-or-user/repo-name/nginx
```

\*\*Make sure the following .env variables are set:

- NEXT_APP_WEBSITE_IMAGE=ghcr.io/org-or-user/repo-name/website
- NEXT_APP_NGINX_IMAGE=ghcr.io/org-or-user/repo-name/nginx

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
