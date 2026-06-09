FROM node:20-alpine AS base
RUN npm install -g pnpm

# Install native compilation dependencies for SQLite/node modules, plus OpenSSL for Prisma and tzdata for timezone support
RUN apk add --no-cache python3 make g++ git openssl libc6-compat tzdata

WORKDIR /app

# Install dependencies in a separate layer
FROM base AS dependencies
COPY core/ ./
RUN pnpm install --frozen-lockfile

# Build application (Extend dependencies to preserve nested workspace node_modules)
FROM dependencies AS builder
RUN npx turbo run build --filter=webapp...

# Runtime stage
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app /app

WORKDIR /app/apps/webapp
EXPOSE 3033
CMD ["node", "server.js"]
