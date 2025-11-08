ARG NODE=node:lts-alpine
FROM ${NODE} AS dependencies
RUN apk add --no-cache libc6-compat

WORKDIR /app
COPY package.json package-lock.json* ./
# Install ALL dependencies (including dev) for building
RUN npm ci

FROM ${NODE} AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Build the Next.js app - this will create .next/standalone
RUN npm run build

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
COPY --from=builder /app/package.json ./package.json
COPY --from=builder --chown=appuser:nodegroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:nodegroup /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:nodegroup /app/public ./public

USER appuser

# Expose the listening port
EXPOSE 3000

CMD ["node", "server.js"]
