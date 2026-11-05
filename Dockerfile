# Automation Studio: one image for the dashboard (web) and the background worker.

# ---- 1. Build the dashboard ----
FROM node:25-bookworm-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- 2. Runtime ----
FROM node:25-bookworm-slim
ENV IN_DOCKER=1 NODE_ENV=production

# ffmpeg/ffprobe, edge-tts (free voice), Bengali fonts for the ffmpeg caption fallback,
# the libraries Remotion's headless Chrome needs, and the Claude Code CLI.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ca-certificates ffmpeg python3 python3-pip fonts-noto-core fontconfig \
     libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev \
     libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
  && pip3 install --no-cache-dir --break-system-packages edge-tts \
  && npm install -g @anthropic-ai/claude-code \
  && rm -rf /var/lib/apt/lists/* /root/.npm

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Download Remotion's headless Chrome now, not on the first render.
RUN node -e "require('@remotion/renderer').ensureBrowser().then(() => console.log('browser ready'))"

COPY src ./src
COPY server ./server
COPY --from=web /web/dist ./web/dist

EXPOSE 7000
CMD ["node", "server/api.js"]
