FROM node:20-alpine AS base
RUN npm install -g pnpm

# Install native compilation dependencies for SQLite/node modules
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Install dependencies in a separate layer
FROM base AS dependencies
COPY core/package.json core/pnpm-lock.yaml* core/pnpm-workspace.yaml* ./
COPY core/ ./
RUN pnpm install --frozen-lockfile

# Build application (Filter to only build webapp and its dependencies)
FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY core/ ./
RUN npx turbo run build --filter=webapp...

# Runtime stage
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app /app

WORKDIR /app/apps/webapp
EXPOSE 3033
CMD ["node", "server.js"]
