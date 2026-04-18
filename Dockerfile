ARG NODE=node:24.14.0-alpine
FROM ${NODE} AS dependencies
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml* .npmrc ./
# Install ALL dependencies (including dev) for building
# Use cache mount for pnpm store to speed up installs
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM ${NODE} AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules

# Copy package files first for Prisma generation
COPY package.json pnpm-lock.yaml* .npmrc ./
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

ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

ARG NEXT_PUBLIC_STRIPE_PRICE_MINIMUM
ENV NEXT_PUBLIC_STRIPE_PRICE_MINIMUM=$NEXT_PUBLIC_STRIPE_PRICE_MINIMUM

ARG NEXT_PUBLIC_STRIPE_PRICE_EXTRA
ENV NEXT_PUBLIC_STRIPE_PRICE_EXTRA=$NEXT_PUBLIC_STRIPE_PRICE_EXTRA

ARG NEXT_PUBLIC_STRIPE_PRICE_EXTRA_EXTRA
ENV NEXT_PUBLIC_STRIPE_PRICE_EXTRA_EXTRA=$NEXT_PUBLIC_STRIPE_PRICE_EXTRA_EXTRA

ARG NEXT_PUBLIC_CDN_DOMAIN
ENV NEXT_PUBLIC_CDN_DOMAIN=$NEXT_PUBLIC_CDN_DOMAIN

# Build argument to bust cache when artifact changes (set to BUILD_ID or timestamp)
ARG CACHE_BUST=unknown
RUN echo "=== Docker Build Cache Info ===" && \
    echo "CACHE_BUST value: ${CACHE_BUST}" && \
    echo "This should change with each new build" && \
    echo "==============================="

# Use prebuilt Next.js output from CI/CD when available to avoid rebuilding inside Docker
# Priority: 1) next-build.tar.gz artifact 2) existing .next directory 3) build from scratch
RUN if [ -f next-build.tar.gz ]; then \
      echo "✓ Found next-build.tar.gz artifact"; \
      ls -lh next-build.tar.gz; \
      echo "Extracting pre-built .next from CI/CD..."; \
      tar -xzf next-build.tar.gz; \
      if [ -f .next/BUILD_ID ]; then \
        BUILD_ID=$(cat .next/BUILD_ID); \
        echo "✓ Extracted build with BUILD_ID: $BUILD_ID"; \
      else \
        echo "⚠️  Warning: BUILD_ID file not found after extraction"; \
      fi; \
      if [ -f .next/static/chunks/webpack-*.js ]; then \
        WEBPACK=$(ls .next/static/chunks/webpack-*.js | head -1 | xargs basename); \
        echo "✓ Webpack chunk in image: $WEBPACK"; \
      fi; \
    elif [ -d .next ]; then \
      echo "Using existing pre-built .next directory"; \
    else \
      echo "Building Next.js from scratch"; \
      echo "Generating Prisma Client..."; \
      pnpm exec prisma generate; \
      pnpm exec next build --webpack; \
    fi

# Stage 2: Create final image
FROM ${NODE} AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Install fonts for Sharp SVG text rendering.
# - fontconfig is needed for font discovery.
# - ttf-dejavu gives us a solid default when requested families are missing.
# - Google Fonts are fetched from the google/fonts GitHub repo, which is the
#   canonical open-source mirror and far more stable than the fonts.google.com
#   download endpoint (which rate-limits CI and changes URLs without notice).
#   curl --fail aborts the build if any font download returns a non-2xx, so
#   silent supply-chain swaps get caught at image build time. curl is removed
#   from the final image after the build step to minimise the runtime attack
#   surface.
RUN set -e \
    && apk add --no-cache fontconfig ttf-dejavu \
    && apk add --no-cache --virtual .font-build-deps curl \
    && mkdir -p /usr/share/fonts/google \
    && REPO="https://github.com/google/fonts/raw/main" \
    && for entry in \
         "ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf:Roboto.ttf" \
         "ofl/opensans/OpenSans%5Bwdth%2Cwght%5D.ttf:OpenSans.ttf" \
         "ofl/lato/Lato%5Bwght%5D.ttf:Lato.ttf" \
         "ofl/oswald/Oswald%5Bwght%5D.ttf:Oswald.ttf" \
         "ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf:PlayfairDisplay.ttf"; do \
        src="${entry%%:*}"; dest="${entry##*:}"; \
        curl -sSL --fail --retry 3 --retry-delay 2 \
          "${REPO}/${src}" -o "/usr/share/fonts/google/${dest}" \
          || exit 1; \
        done \
    && fc-cache -fv \
    && apk del .font-build-deps

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
