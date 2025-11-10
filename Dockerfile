ARG NODE=node:lts-alpine
FROM ${NODE} AS dependencies
RUN apk add --no-cache libc6-compat

WORKDIR /app
COPY package.json package-lock.json* ./
# Install ALL dependencies (including dev) for building
RUN npm ci

FROM ${NODE} AS builder
# Build argument to control whether to use pre-built assets
ARG USE_PREBUILT_ASSETS=false

WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Set NODE_ENV for build
ENV NODE_ENV=production
# Skip environment validation during build (vars only available at runtime)
ENV SKIP_ENV_VALIDATION=true

# Generate Prisma Client
RUN npx prisma generate

# Build or extract based on build argument
RUN if [ "${USE_PREBUILT_ASSETS}" = "true" ]; then \
      echo "Using pre-built .next from CI/CD"; \
      tar -xzf .next-build.tar.gz; \
    else \
      echo "Building Next.js from scratch"; \
      npx next build; \
    fi

# Stage 2: Create final image
FROM ${NODE} AS runner

ENV NODE_ENV production
ENV PORT 3000
ENV NEXT_TELEMETRY_DISABLED 1

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
