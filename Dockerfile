FROM node:20-slim AS builder
WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y python3 make g++ git

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the Next.js application
RUN npm run build

# Production stage
FROM node:20-slim AS runner
WORKDIR /app

# Install runtime dependencies for SQLite, curl, and Playwright's Chromium system libs
RUN apt-get update && apt-get install -y libsqlite3-0 curl \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
    libasound2 libatspi2.0-0 && rm -rf /var/lib/apt/lists/*

# Copy built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
