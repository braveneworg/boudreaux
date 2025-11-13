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

# Build stage
FROM node:22.12.0-alpine AS build

WORKDIR /app

# Copy build artifact
COPY next-build.tar.gz .
RUN tar -xzf next-build.tar.gz && rm next-build.tar.gz

# Production stage
FROM node:22.12.0-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy built application
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
