# Spec: Self-Hosted CORE Memory OS Deployment

This specification outlines the architecture, configuration, and verification steps for deploying the RedPlanetHQ/core Personal AI OS/Memory stack on a home lab VM.

## Objective
Deploy a fully containerized instance of CORE (including the databases and the Node.js application server) under a custom network structure to enable secure, persistent memory sharing across multiple local and remote AI agents.

## User Preferences & Constraints
*   **Operating Environment:** Linux/Ubuntu home lab VM.
*   **Path Conventions:** All Docker-related stacks are placed under the user's `~/docker/` directory (specifically `~/docker/core-stack/`).
*   **DNS & Domains:** The base domain for the homelab is `example.com`. The CORE stack is mapped to `core.example.com`.
*   **Routing & SSL:** Traefik handles SSL termination using Cloudflare DNS validation for dynamic/wildcard certificates (`*.example.com`).
*   **Installation Model:** Fully containerized via Docker and Docker Compose (Option 2). The host VM should remain clean of direct package installations (Node.js, pnpm, etc.) other than Docker itself.
*   **Security & Overlay Networks:** The stack connects to an external Docker network `agent-net`. In the future, a Pangolin `newt` tunnel container will connect to this network, allowing remote zero-port access to CORE's API/dashboard.

---

## Architectural Layout

```mermaid
graph TD
    subgraph Host VM
        subgraph Docker Network: agent-net
            Traefik[Traefik Proxy]
            Newt[Pangolin Newt Client]
            CoreApp[core-app:3033]
            Postgres[core-postgres:5432]
            Neo4j[core-neo4j:7474/7687]
            Redis[core-redis:6379]
        end
    end

    User[Local User / Agents] -->|HTTPS via core.example.com| Traefik
    Pangolin[Pangolin Cloud Server] -->|SSH Tunnel/WireGuard| Newt
    Newt -->|Direct Container Name Resolution| CoreApp
    Traefik -->|Proxy Pass| CoreApp
    CoreApp --> Postgres
    CoreApp --> Neo4j
    CoreApp --> Redis
```

---

## Directory Structure

```text
~/docker/core-stack/
├── docker-compose.yml
├── .env
└── core/                # Cloned git repository
    ├── Dockerfile       # Custom multi-stage build file
    └── ...
```

---

## Configuration Details

### 1. Custom Dockerfile (`~/docker/core-stack/core/Dockerfile`)
Since CORE does not distribute a pre-compiled application image, we build the application container directly on the host using the cloned code.

```dockerfile
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

# Build application
FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY core/ ./
RUN pnpm build

# Runtime stage
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app ./

EXPOSE 3033
CMD ["pnpm", "start"]
```

### 2. Docker Compose Configuration (`~/docker/core-stack/docker-compose.yml`)

```yaml
version: '3.8'

services:
  # The CORE Web App & Memory Orchestrator
  core-app:
    build:
      context: .
      dockerfile: ./core/Dockerfile
    container_name: core-app
    restart: unless-stopped
    environment:
      - PORT=3033
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
      - NEO4J_URI=bolt://neo4j:7687
      - NEO4J_USERNAME=neo4j
      - NEO4J_PASSWORD=${NEO4J_PASSWORD}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    depends_on:
      - postgres
      - redis
      - neo4j
    networks:
      - agent-net
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.core.rule=Host(`core.example.com`)"
      - "traefik.http.routers.core.entrypoints=websecure"
      - "traefik.http.routers.core.tls=true"
      - "traefik.http.routers.core.tls.certresolver=cloudflare"
      - "traefik.http.services.core.loadbalancer.server.port=3033"

  # Relational Database
  postgres:
    image: postgres:15-alpine
    container_name: core-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - agent-net

  # Knowledge Graph (Neo4j)
  neo4j:
    image: neo4j:5-community
    container_name: core-neo4j
    restart: unless-stopped
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
      NEO4J_PLUGINS: '["apoc"]'
    volumes:
      - neo4j_data:/data
      - neo4j_plugins:/plugins
    networks:
      - agent-net

  # Queue & Cache (Redis)
  redis:
    image: redis:7-alpine
    container_name: core-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    networks:
      - agent-net

volumes:
  postgres_data:
  neo4j_data:
  neo4j_plugins:
  redis_data:

networks:
  agent-net:
    external: true
```

### 3. Environment Secrets Template (`~/docker/core-stack/.env`)

```env
# Database Settings
POSTGRES_DB=core_brain
POSTGRES_PASSWORD=generate_strong_postgres_password
NEO4J_PASSWORD=generate_strong_neo4j_password
REDIS_PASSWORD=generate_strong_redis_password

# External LLM Keys
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
```

---

## Verification Plan

### 1. Docker Build & Initialization
Verify that the services build and spin up without runtime exceptions:
```bash
# Verify shared network exists
docker network inspect agent-net >/dev/null || docker network create agent-net

# Run the build
docker compose build

# Start services
docker compose up -d
```

### 2. Container Health Checks
*   **PostgreSQL:** Verify Postgres is accepting connections.
    `docker exec -it core-postgres pg_isready -U postgres`
*   **Neo4j:** Verify graph engine is alive and authenticated.
    `curl -I http://core-neo4j:7474`
*   **Redis:** Check ping response.
    `docker exec -it core-redis redis-cli -a $REDIS_PASSWORD ping`
*   **Application Server Logs:** Verify that migrations have run and server has booted.
    `docker compose logs -f core-app`

### 3. Routing & Gateway Verification
*   Confirm the dashboard is loading correctly at `https://core.example.com`.
*   Ensure that Traefik successfully issues the Cloudflare TLS certificate.
