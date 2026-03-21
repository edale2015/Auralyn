# Phase 1 / Step 1
# Production-safe multi-stage Docker build

FROM node:20-alpine AS builder

WORKDIR /app

# Install ALL dependencies (dev included) — build tools like tsx, vite, esbuild required here
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Build must fail loudly if anything is wrong
RUN npm run build

# --------------------------------------------------

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy built output from builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.cjs"]
