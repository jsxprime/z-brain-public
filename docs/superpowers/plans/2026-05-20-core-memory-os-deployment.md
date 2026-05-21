# Self-Hosted CORE Memory OS Deployment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure and prepare the configuration files for a fully containerized instance of the RedPlanetHQ/core Personal AI OS/Memory stack on a home lab VM, using local bind mounts for storage and external Traefik reverse proxying over a custom overlay network.

**Architecture:** A multi-container Docker Compose stack containing PostgreSQL (relational state), Neo4j (temporal knowledge graph), Redis (caching and queues), and a custom Node-built CORE application server. The stack routes traffic through an external Traefik proxy on the `agent-net` Docker network.

**Tech Stack:** Docker, Docker Compose, PostgreSQL 15, Neo4j 5 (Community Edition), Redis 7.

---

## User Review Required

> [!IMPORTANT]
> The environment files contain placeholders for API credentials (Anthropic, OpenAI, Gemini). These keys must be populated on the VM before running the stack.
> Database credentials in `.env` should be generated securely before spin up.

---

## Open Questions

> [!NOTE]
> No outstanding questions exist as the spec was updated to incorporate bind mounts and the specific routing requirements.

---

## Proposed Changes

We will create a new directory structure `core-stack` in the workspace to contain the deployment configurations. This folder can be copied or pulled directly to the remote server under `~/docker/core-stack/`.

### Deployment Configuration

#### [NEW] [docker-compose.yml](file:///Volumes/nvme-2tb/ant-workspace/z-brain/core-stack/docker-compose.yml)
Contains the definition of the four containers (`core-app`, `core-postgres`, `core-neo4j`, `core-redis`), external networking config, and Traefik routing labels.

#### [NEW] [.env.example](file:///Volumes/nvme-2tb/ant-workspace/z-brain/core-stack/.env.example)
A template env file containing all required database variables, ports, and API key placeholders.

#### [NEW] [Dockerfile](file:///Volumes/nvme-2tb/ant-workspace/z-brain/core-stack/Dockerfile)
A custom multi-stage Docker build file for the CORE Node.js app runner.

---

## Task steps

### Task 1: Initialize Stack Configuration Directory

**Files:**
- Create: `core-stack/.env.example`

- [ ] **Step 1: Create the .env template file**
  Create [core-stack/.env.example](file:///Volumes/nvme-2tb/ant-workspace/z-brain/core-stack/.env.example) with environment keys for databases and LLM providers.
- [ ] **Step 2: Commit initial structure**
  Commit the config directory and template:
  ```bash
  git add core-stack/.env.example
  git commit -m "feat: initialize env template for CORE stack"
  ```

---

### Task 2: Create Dockerfile for Application Builder

**Files:**
- Create: `core-stack/Dockerfile`

- [ ] **Step 1: Create the multi-stage Dockerfile**
  Create [core-stack/Dockerfile](file:///Volumes/nvme-2tb/ant-workspace/z-brain/core-stack/Dockerfile) using a `node:20-alpine` base image, installing `pnpm`, fetching the core repository, building, and serving the output on port 3033.
- [ ] **Step 2: Commit Dockerfile**
  Commit the Dockerfile:
  ```bash
  git add core-stack/Dockerfile
  git commit -m "feat: add application dockerfile build stage"
  ```

---

### Task 3: Configure Docker Compose Services

**Files:**
- Create: `core-stack/docker-compose.yml`

- [ ] **Step 1: Create the docker-compose file**
  Create [core-stack/docker-compose.yml](file:///Volumes/nvme-2tb/ant-workspace/z-brain/core-stack/docker-compose.yml) exposing Postgres, Neo4j, Redis, and core-app. Define bind mounts mapping to `./data/postgres`, `./data/neo4j`, `./data/neo4j-plugins`, and `./data/redis`. Attach them all to the external `agent-net` network, adding Traefik routing rules.
- [ ] **Step 2: Commit Compose configuration**
  Commit the Compose configuration:
  ```bash
  git add core-stack/docker-compose.yml
  git commit -m "feat: configure docker-compose services with bind mounts"
  ```

---

## Verification Plan

### Automated / Local Verification
- Check docker-compose syntax locally in the workspace:
  ```bash
  docker compose -f core-stack/docker-compose.yml config
  ```
  *Expected:* No YAML validation errors.

### Manual Verification
1. Copy the `core-stack` folder to the remote VM under `~/docker/core-stack/`.
2. Clone the CORE repository into `~/docker/core-stack/core`:
   ```bash
   git clone https://github.com/RedPlanetHQ/core.git ~/docker/core-stack/core
   ```
3. Copy `.env.example` to `.env` and fill in custom database passwords and API keys.
4. Ensure the external docker network `agent-net` exists:
   ```bash
   docker network create agent-net
   ```
5. Run `docker compose build` to build the app container.
6. Spin up the stack: `docker compose up -d`
7. Verify containers are healthy and database volumes/folders are created under `~/docker/core-stack/data`.
