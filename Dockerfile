# ── Stage 1: Install production dependencies ──────────────────────
FROM node:20-slim AS deps

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── Stage 2: Production image ─────────────────────────────────────
FROM node:20-slim

# Resvg needs fontconfig for system font fallback
RUN apt-get update && apt-get install -y --no-install-recommends \
    libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

# Run as non-root
RUN groupadd -r app && useradd -r -g app app

WORKDIR /app

# Copy deps from build stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application files
COPY package.json ./
COPY core.mjs ./
COPY tweet-fetch.mjs ./
COPY tweet-html.mjs ./
COPY tweet-render.mjs ./
COPY tweet-emoji.mjs ./
COPY tweet-fonts.mjs ./
COPY tweet-utils.mjs ./
COPY tweet-shots.mjs ./
COPY landing.html ./
COPY landing.js ./
COPY docs.html ./
COPY docs.js ./
COPY llm-docs.txt ./
COPY favicon.svg ./
COPY fonts/ ./fonts/
COPY src/ ./src/

# Set ownership
RUN chown -R app:app /app

USER app

ENV NODE_ENV=production
ENV PORT=8080
ENV TZ=UTC

EXPOSE 8080

CMD ["node", "src/server.mjs"]
