ARG NODE=node:lts-alpine
FROM ${NODE} AS dependencies
RUN apk add --no-cache libc6-compat

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production --frozen-lockfile

FROM ${NODE} AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm ci && npm cache clean --force
RUN npm run build

# Stage 2: Create final image
FROM ${NODE} AS runner

ENV NODE_ENV production
ENV PORT 3000
ENV NEXT_TELEMETRY_DISABLED 1

# Create a non-root user
RUN addgroup --system --gid 1001 nodegroup
RUN adduser --system --uid 1001 appuser

# Copy necessary files
# TODO: Copy public to S3 bucket and invalidate CloudFront cache
# Static assets are uploaded to S3 outside of the Docker build.
COPY --from=builder /app/package.json ./package.json
COPY --from=builder --chown=appuser:nodegroup /app/.next/standalone .

USER appuser

# Expose the listening port
EXPOSE 3000

CMD ["node", "server.js"]
