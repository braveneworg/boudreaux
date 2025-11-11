ARG NODE=node:lts-alpine
FROM ${NODE} AS dependencies
RUN apk add --no-cache libc6-compat

WORKDIR /app
COPY package.json package-lock.json* ./
# Install ALL dependencies (including dev) for building
# Use cache mount for npm cache to speed up installs
RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM ${NODE} AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules

# Copy package files first for Prisma generation
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# Now copy source code (changes most frequently)
COPY . .

# Set NODE_ENV for build
ENV NODE_ENV=production
# Skip environment validation during build (vars only available at runtime)
ENV SKIP_ENV_VALIDATION=true

# Build-time arguments for NEXT_PUBLIC_* variables
# These must be available during build because Next.js bakes them into the client bundle
ARG NEXT_PUBLIC_CLOUDFLARE_SITE_KEY
ENV NEXT_PUBLIC_CLOUDFLARE_SITE_KEY=$NEXT_PUBLIC_CLOUDFLARE_SITE_KEY

# Use prebuilt Next.js output from CI/CD when available to avoid rebuilding inside Docker
# Priority: 1) next-build.tar.gz artifact 2) existing .next directory 3) build from scratch
RUN if [ -f next-build.tar.gz ]; then \
      echo "Using pre-built .next from CI/CD (next-build.tar.gz)"; \
      tar -xzf next-build.tar.gz; \
    elif [ -d .next ]; then \
      echo "Using existing pre-built .next directory"; \
    else \
      echo "Building Next.js from scratch"; \
      echo "Generating Prisma Client..."; \
      npx prisma generate; \
      npx next build; \
    fi

# Stage 2: Create final image
FROM ${NODE} AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user
RUN addgroup --system --gid 1001 nodegroup
RUN adduser --system --uid 1001 appuser

WORKDIR /app

# Copy necessary files from builder
# First copy the standalone output which includes server.js and dependencies
COPY --from=builder --chown=appuser:nodegroup /app/.next/standalone ./
# Then copy the static files to the correct location
COPY --from=builder --chown=appuser:nodegroup /app/.next/static ./.next/static
# Copy public files
COPY --from=builder --chown=appuser:nodegroup /app/public ./public

USER appuser

# Expose the listening port
EXPOSE 3000

CMD ["node", "server.js"]
