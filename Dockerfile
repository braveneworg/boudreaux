ARG NODE=node:22.12.0-alpine
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
      npx prisma generate; \
      npx next build; \
    fi

# Stage 2: Create final image
FROM ${NODE} AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Install fonts for Sharp SVG text rendering
# fontconfig is needed for font discovery
# Download Google Fonts TTF files directly from jsDelivr CDN (fontsource)
RUN apk add --no-cache fontconfig ttf-dejavu \
    && mkdir -p /usr/share/fonts/google \
    && cd /usr/share/fonts/google \
    # Roboto
    && wget -q "https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-400-normal.ttf" -O Roboto-Regular.ttf \
    && wget -q "https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-700-normal.ttf" -O Roboto-Bold.ttf \
    # Open Sans
    && wget -q "https://cdn.jsdelivr.net/fontsource/fonts/open-sans@latest/latin-400-normal.ttf" -O OpenSans-Regular.ttf \
    && wget -q "https://cdn.jsdelivr.net/fontsource/fonts/open-sans@latest/latin-700-normal.ttf" -O OpenSans-Bold.ttf \
    # Lato
    && wget -q "https://cdn.jsdelivr.net/fontsource/fonts/lato@latest/latin-400-normal.ttf" -O Lato-Regular.ttf \
    && wget -q "https://cdn.jsdelivr.net/fontsource/fonts/lato@latest/latin-700-normal.ttf" -O Lato-Bold.ttf \
    # Oswald
    && wget -q "https://cdn.jsdelivr.net/fontsource/fonts/oswald@latest/latin-400-normal.ttf" -O Oswald-Regular.ttf \
    && wget -q "https://cdn.jsdelivr.net/fontsource/fonts/oswald@latest/latin-700-normal.ttf" -O Oswald-Bold.ttf \
    # Montserrat
    && wget -q "https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-400-normal.ttf" -O Montserrat-Regular.ttf \
    && wget -q "https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-700-normal.ttf" -O Montserrat-Bold.ttf \
    # Playfair Display
    && wget -q "https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-400-normal.ttf" -O PlayfairDisplay-Regular.ttf \
    && wget -q "https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-700-normal.ttf" -O PlayfairDisplay-Bold.ttf \
    # Refresh font cache
    && fc-cache -fv

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
