FROM node:22.23.4-slim AS builder
WORKDIR /app

# Toolchain for better-sqlite3's source-build fallback when no prebuilt binary matches the platform.
RUN apt-get update && apt-get install -y python3 make g++ git

COPY package*.json ./
RUN npm ci

# Each playwright-core release drives one Chromium revision. Installing with the CLI that npm ci
# just placed from package-lock.json keeps the browser in step with the playwright-core the server
# loads; the runner has no full node_modules, so npx there would fetch the newest Playwright from
# the registry instead.
RUN node node_modules/playwright/cli.js install chromium-headless-shell

COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle, so they must be
# present at build time — runtime env_file is too late for these.
ARG NEXT_PUBLIC_UMAMI_SRC
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ENV NEXT_PUBLIC_UMAMI_SRC=$NEXT_PUBLIC_UMAMI_SRC
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID

RUN npm run build

FROM node:22.23.4-slim AS runner
WORKDIR /app

# curl is the compose healthcheck; the rest are the system libraries Chromium's headless shell
# links against. better-sqlite3 compiles SQLite into its own binary, so no libsqlite3 is needed.
RUN apt-get update && apt-get install -y curl \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
    libasound2 libatspi2.0-0 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
# Docker sets HOSTNAME to the container id and the standalone server binds to it, which would
# leave the healthcheck's curl to localhost unanswered.
ENV HOSTNAME=0.0.0.0

# The standalone output holds only the modules the server traces as imports, in place of the
# builder's full node_modules; it leaves out static assets and public/, so those copy separately.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# /about is prerendered, so its HTML is already inside .next. The source ships
# anyway: a file the build reads and the runtime lacks fails only in production,
# and only once the page stops being static.
COPY --from=builder /app/content ./content
# The scrapers launch Chromium from the server process as root, so the browser goes where
# playwright-core looks by default for root.
COPY --from=builder /root/.cache/ms-playwright /root/.cache/ms-playwright

EXPOSE 3000

CMD ["node", "server.js"]
