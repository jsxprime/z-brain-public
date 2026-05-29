# Z-Brain Ecosystem — Deployment Plan

> **For agentic workers:** This is an ops/deployment plan. Execute steps sequentially via SSH to the Z-Brain VM. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the complete Z-Brain Ecosystem to the VM via Docker: Traefik (reverse proxy + TLS), Zulip (chat), Wiki.js (wiki), Memory Synthesizer (pipeline), and Dashboard (control center). Wire webhooks. Verify end-to-end data flow.

**VM:** `YOUR_VM_IP` (user: `YOUR_VM_USER`)
**Docker network:** `agent-net` (external, shared by all stacks)
**Domain scheme:** `*.zb.example.com` (wildcard — all services are subdomains of `zb.example.com`)
**TLS:** Let's Encrypt via Cloudflare DNS-01 challenge (no ports exposed to internet)

### Subdomain Map

| Service | Subdomain | Container Port |
|---------|-----------|---------------|
| Traefik Dashboard | `traefik.zb.example.com` | 8080 |
| Z-Brain Dashboard | `dash.zb.example.com` | 3090 |
| Zulip | `chat.zb.example.com` | 80 |
| Wiki.js | `wiki.zb.example.com` | 3000 |
| OpenBrain (core) | `core.zb.example.com` | 3033 |
| Hermes Agent | `hermes.zb.example.com` | 8642 |
| Portainer | `portainer.zb.example.com` | 9000 |
| Synthesizer API | `synth.zb.example.com` | 3080 (optional) |

---

## Task 0: Traefik Reverse Proxy with Cloudflare DNS Challenge

This is the foundation. Every other service sits behind Traefik for automatic TLS and routing.

### Prerequisites

Before starting, you need a **Cloudflare API Token** with DNS edit permissions:
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **My Profile** → **API Tokens**
2. Click **Create Token**
3. Use the **"Edit zone DNS"** template
4. Set **Zone Resources** to: `Include → Specific zone → example.com`
5. Copy the token — you'll need it in the next step

### Local DNS Setup

Point `*.zb.example.com` to `YOUR_VM_IP` in your local DNS resolver (router, Pi-hole, etc.):

```
*.zb.example.com → YOUR_VM_IP
```

> **Alternative:** You can also create a wildcard A record in Cloudflare DNS pointing to your private IP (`YOUR_VM_IP`). Cloudflare allows this — the DNS challenge doesn't require the IP to be public. Set the proxy status to **DNS only** (gray cloud).

- [ ] **Step 1: Create Traefik directory and acme.json**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP << 'EOF'
mkdir -p ~/docker/traefik/data
touch ~/docker/traefik/data/acme.json
chmod 600 ~/docker/traefik/data/acme.json
EOF
```

- [ ] **Step 2: Create .env file**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cat > ~/docker/traefik/.env << 'ENVEOF'
# Cloudflare API Token (Zone.DNS Edit permission for example.com)
CF_DNS_API_TOKEN=REPLACE_WITH_YOUR_CLOUDFLARE_API_TOKEN

# Let's Encrypt registration email
ACME_EMAIL=jay@example.com
ENVEOF"
```

> **IMPORTANT for executor:** Replace `REPLACE_WITH_YOUR_CLOUDFLARE_API_TOKEN` with the real token from the prerequisite step.

- [ ] **Step 3: Create docker-compose.yml**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cat > ~/docker/traefik/docker-compose.yml << 'COMPEOF'
# Traefik Reverse Proxy — Z-Brain Ecosystem
# Provides TLS via Let's Encrypt (Cloudflare DNS-01 challenge)
# Wildcard cert for *.zb.example.com

services:
  traefik:
    image: traefik:v3.3
    container_name: traefik
    restart: unless-stopped
    ports:
      - \"80:80\"
      - \"443:443\"
    environment:
      CF_DNS_API_TOKEN: \${CF_DNS_API_TOKEN}
    command:
      # --- API / Dashboard ---
      - \"--api.dashboard=true\"
      - \"--api.insecure=false\"

      # --- Providers ---
      - \"--providers.docker=true\"
      - \"--providers.docker.exposedbydefault=false\"
      - \"--providers.docker.network=agent-net\"

      # --- Entrypoints ---
      - \"--entrypoints.web.address=:80\"
      - \"--entrypoints.web.http.redirections.entrypoint.to=websecure\"
      - \"--entrypoints.web.http.redirections.entrypoint.scheme=https\"
      - \"--entrypoints.websecure.address=:443\"

      # --- Let's Encrypt (Cloudflare DNS challenge) ---
      - \"--certificatesresolvers.cloudflare.acme.dnschallenge=true\"
      - \"--certificatesresolvers.cloudflare.acme.dnschallenge.provider=cloudflare\"
      - \"--certificatesresolvers.cloudflare.acme.dnschallenge.delayBeforeCheck=30\"
      - \"--certificatesresolvers.cloudflare.acme.email=\${ACME_EMAIL}\"
      - \"--certificatesresolvers.cloudflare.acme.storage=/letsencrypt/acme.json\"

      # --- Wildcard cert for *.zb.example.com ---
      - \"--entrypoints.websecure.http.tls=true\"
      - \"--entrypoints.websecure.http.tls.certresolver=cloudflare\"
      - \"--entrypoints.websecure.http.tls.domains[0].main=zb.example.com\"
      - \"--entrypoints.websecure.http.tls.domains[0].sans=*.zb.example.com\"

      # --- Logging ---
      - \"--log.level=INFO\"

    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./data/acme.json:/letsencrypt/acme.json
    networks:
      - agent-net
    labels:
      # Traefik dashboard at traefik.zb.example.com
      - \"traefik.enable=true\"
      - \"traefik.http.routers.traefik-dashboard.rule=Host(\`traefik.zb.example.com\`)\"
      - \"traefik.http.routers.traefik-dashboard.entrypoints=websecure\"
      - \"traefik.http.routers.traefik-dashboard.tls=true\"
      - \"traefik.http.routers.traefik-dashboard.tls.certresolver=cloudflare\"
      - \"traefik.http.routers.traefik-dashboard.service=api@internal\"

networks:
  agent-net:
    external: true
COMPEOF"
```

- [ ] **Step 4: Start Traefik**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cd ~/docker/traefik && docker compose up -d"
```

- [ ] **Step 5: Verify Traefik is running and cert is issued**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "docker logs traefik --tail 20"
```

Look for: `Obtained certificate for *.zb.example.com` (may take 30-60 seconds for DNS propagation).

If using local DNS, test from your Mac:

```bash
curl -k https://traefik.zb.example.com/api/version
```

Expected: JSON with Traefik version info.

> **Troubleshooting:** If cert fails, check:
> - Is the Cloudflare API token correct?
> - Does the token have `Zone.DNS.Edit` permission for `example.com`?
> - Try adding `--certificatesresolvers.cloudflare.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory` to test with staging first

---

## Task 1: Update Existing Stacks with New Subdomains

The `core-stack` already has Traefik labels, but they point to `core.example.com`. Update them to the new `*.zb.example.com` scheme.

- [ ] **Step 1: Update core-stack labels**

Edit `/Volumes/nvme-2tb/ant-workspace/z-brain/core-stack/docker-compose.yml` — change the Traefik labels on `core-app`:

```yaml
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.core.rule=Host(`core.zb.example.com`)"
      - "traefik.http.routers.core.entrypoints=websecure"
      - "traefik.http.routers.core.tls=true"
      - "traefik.http.routers.core.tls.certresolver=cloudflare"
      - "traefik.http.services.core.loadbalancer.server.port=3033"
```

- [ ] **Step 2: Add Traefik labels to hermes-agent**

Check the hermes-stack docker-compose.yml and add labels for `hermes.zb.example.com`:

```yaml
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.hermes.rule=Host(`hermes.zb.example.com`)"
      - "traefik.http.routers.hermes.entrypoints=websecure"
      - "traefik.http.routers.hermes.tls=true"
      - "traefik.http.routers.hermes.tls.certresolver=cloudflare"
      - "traefik.http.services.hermes.loadbalancer.server.port=8642"
```

- [ ] **Step 3: Rsync updated configs and restart existing stacks**

```bash
rsync -av /Volumes/nvme-2tb/ant-workspace/z-brain/core-stack/docker-compose.yml YOUR_VM_USER@YOUR_VM_IP:~/docker/core-stack/docker-compose.yml
ssh YOUR_VM_USER@YOUR_VM_IP "cd ~/docker/core-stack && docker compose up -d"
```

(Repeat for hermes-stack if labels were added)

---

## Task 2: Deploy Zulip

Zulip requires 4 supporting services: PostgreSQL, Memcached, RabbitMQ, and Redis. All internal to its stack.

- [ ] **Step 1: Create directory**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "mkdir -p ~/docker/zulip-stack"
```

- [ ] **Step 2: Create .env**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cat > ~/docker/zulip-stack/.env << 'ENVEOF'
ZULIP_EXTERNAL_HOST=chat.zb.example.com
ZULIP_ADMIN_EMAIL=jay@example.com

POSTGRES_PASSWORD=zulippostgres2026
MEMCACHED_PASSWORD=zulipmemcached2026
RABBITMQ_PASSWORD=zuliprabbitmq2026
REDIS_PASSWORD=zulipredis2026
ENVEOF"
```

Then generate and append a real secret key:

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "echo \"ZULIP_SECRET_KEY=\$(openssl rand -base64 48)\" >> ~/docker/zulip-stack/.env"
```

- [ ] **Step 3: Create docker-compose.yml**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cat > ~/docker/zulip-stack/docker-compose.yml << 'COMPEOF'
# Zulip Chat — Z-Brain Ecosystem

services:
  zulip-database:
    image: zulip/zulip-postgresql:14
    container_name: zulip-database
    restart: unless-stopped
    environment:
      POSTGRES_DB: zulip
      POSTGRES_USER: zulip
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - ./data/postgres:/var/lib/postgresql/data

  zulip-memcached:
    image: memcached:alpine
    container_name: zulip-memcached
    restart: unless-stopped
    command: memcached -m 64

  zulip-rabbitmq:
    image: rabbitmq:4.0-alpine
    container_name: zulip-rabbitmq
    restart: unless-stopped
    environment:
      RABBITMQ_DEFAULT_USER: zulip
      RABBITMQ_DEFAULT_PASS: \${RABBITMQ_PASSWORD}
    volumes:
      - ./data/rabbitmq:/var/lib/rabbitmq

  zulip-redis:
    image: redis:7-alpine
    container_name: zulip-redis
    restart: unless-stopped
    command: redis-server --requirepass \${REDIS_PASSWORD}
    volumes:
      - ./data/redis:/data

  zulip:
    image: ghcr.io/zulip/zulip-server:latest
    container_name: zulip
    restart: unless-stopped
    environment:
      DISABLE_HTTPS: \"True\"
      SETTING_EXTERNAL_HOST: \${ZULIP_EXTERNAL_HOST}
      SETTING_ZULIP_ADMINISTRATOR: \${ZULIP_ADMIN_EMAIL}
      SETTING_SECRET_KEY: \${ZULIP_SECRET_KEY}
      SETTING_REMOTE_POSTGRES_HOST: zulip-database
      SETTING_REMOTE_POSTGRES_SSLMODE: disable
      SECRETS_postgres_password: \${POSTGRES_PASSWORD}
      SETTING_MEMCACHED_LOCATION: zulip-memcached:11211
      SECRETS_memcached_password: \${MEMCACHED_PASSWORD}
      SETTING_RABBITMQ_HOST: zulip-rabbitmq
      SECRETS_rabbitmq_password: \${RABBITMQ_PASSWORD}
      SETTING_REDIS_HOST: zulip-redis
      SECRETS_redis_password: \${REDIS_PASSWORD}
    volumes:
      - ./data/zulip:/data
    depends_on:
      - zulip-database
      - zulip-memcached
      - zulip-rabbitmq
      - zulip-redis
    networks:
      - default
      - agent-net
    labels:
      - \"traefik.enable=true\"
      - \"traefik.http.routers.zulip.rule=Host(\`chat.zb.example.com\`)\"
      - \"traefik.http.routers.zulip.entrypoints=websecure\"
      - \"traefik.http.routers.zulip.tls=true\"
      - \"traefik.http.routers.zulip.tls.certresolver=cloudflare\"
      - \"traefik.http.services.zulip.loadbalancer.server.port=80\"
      - \"traefik.docker.network=agent-net\"

networks:
  agent-net:
    external: true
COMPEOF"
```

- [ ] **Step 4: Initialize and start Zulip**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cd ~/docker/zulip-stack && docker compose pull"
ssh YOUR_VM_USER@YOUR_VM_IP "cd ~/docker/zulip-stack && docker compose run --rm zulip app:init"
ssh YOUR_VM_USER@YOUR_VM_IP "cd ~/docker/zulip-stack && docker compose up -d"
```

Wait ~60 seconds for Zulip to fully start, then:

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "docker logs zulip --tail 10"
```

- [ ] **Step 5: Generate organization creation link**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "docker compose -f ~/docker/zulip-stack/docker-compose.yml exec -u zulip zulip /home/zulip/deployments/current/manage.py generate_realm_creation_link"
```

Open the returned URL (replace the hostname with `chat.zb.example.com` if needed) to create the first organization and admin account.

- [ ] **Step 6: Verify**

```bash
curl -sI https://chat.zb.example.com | head -5
```

---

## Task 3: Deploy Wiki.js

- [ ] **Step 1: Create directory**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "mkdir -p ~/docker/wikijs-stack"
```

- [ ] **Step 2: Create .env**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cat > ~/docker/wikijs-stack/.env << 'ENVEOF'
WIKIJS_DB_PASSWORD=wikijspostgres2026
ENVEOF"
```

- [ ] **Step 3: Create docker-compose.yml**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cat > ~/docker/wikijs-stack/docker-compose.yml << 'COMPEOF'
# Wiki.js — Z-Brain Ecosystem

services:
  wikijs-database:
    image: postgres:16-alpine
    container_name: wikijs-database
    restart: unless-stopped
    environment:
      POSTGRES_DB: wiki
      POSTGRES_USER: wikijs
      POSTGRES_PASSWORD: \${WIKIJS_DB_PASSWORD}
    volumes:
      - ./data/postgres:/var/lib/postgresql/data

  wikijs:
    image: ghcr.io/requarks/wiki:2
    container_name: wikijs
    restart: unless-stopped
    depends_on:
      - wikijs-database
    environment:
      DB_TYPE: postgres
      DB_HOST: wikijs-database
      DB_PORT: 5432
      DB_USER: wikijs
      DB_PASS: \${WIKIJS_DB_PASSWORD}
      DB_NAME: wiki
    networks:
      - default
      - agent-net
    labels:
      - \"traefik.enable=true\"
      - \"traefik.http.routers.wiki.rule=Host(\`wiki.zb.example.com\`)\"
      - \"traefik.http.routers.wiki.entrypoints=websecure\"
      - \"traefik.http.routers.wiki.tls=true\"
      - \"traefik.http.routers.wiki.tls.certresolver=cloudflare\"
      - \"traefik.http.services.wiki.loadbalancer.server.port=3000\"
      - \"traefik.docker.network=agent-net\"

networks:
  agent-net:
    external: true
COMPEOF"
```

- [ ] **Step 4: Start Wiki.js**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cd ~/docker/wikijs-stack && docker compose up -d"
```

- [ ] **Step 5: Complete setup wizard**

Open `https://wiki.zb.example.com` in your browser. Create admin account, set site URL to `https://wiki.zb.example.com`.

---

## Task 4: Deploy Memory Synthesizer

- [ ] **Step 1: Copy synth-stack to VM**

```bash
rsync -av --exclude='node_modules' --exclude='.env' \
  /Volumes/nvme-2tb/ant-workspace/z-brain/synth-stack/ \
  YOUR_VM_USER@YOUR_VM_IP:~/docker/synth-stack/
```

- [ ] **Step 2: Create .env on VM**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cat > ~/docker/synth-stack/.env << 'ENVEOF'
SYNTH_DB_HOST=synth-postgres
SYNTH_DB_PORT=5432
SYNTH_DB_NAME=synthesizer_db
SYNTH_DB_USER=synth
SYNTH_DB_PASSWORD=synthpostgres1234

SYNTH_PORT=3080
SYNTH_HOST=0.0.0.0

ZULIP_WEBHOOK_SECRET=zulip_synth_secret_2026
WIKIJS_WEBHOOK_SECRET=wikijs_synth_secret_2026

OPENBRAIN_URL=http://openbrain-server:3040
OPENBRAIN_DOMAIN=synthesizer

LLM_API_URL=http://hermes-agent:8642/v1/chat/completions
LLM_API_KEY=REPLACE_WITH_HERMES_API_KEY
LLM_MODEL=gpt-5.4-mini

WORKER_POLL_INTERVAL_MS=5000
WORKER_BATCH_SIZE=10
WORKER_MAX_RETRIES=3
ENVEOF"
```

> **IMPORTANT:** Get the Hermes API key:
> ```bash
> ssh YOUR_VM_USER@YOUR_VM_IP "grep API_SERVER_KEY ~/docker/hermes-stack/.env"
> ```

- [ ] **Step 3: Update synth-stack docker-compose with Traefik labels**

The synth-stack's docker-compose.yml should have these labels on `synth-app` (update if needed):

```yaml
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.synth.rule=Host(`synth.zb.example.com`)"
      - "traefik.http.routers.synth.entrypoints=websecure"
      - "traefik.http.routers.synth.tls=true"
      - "traefik.http.routers.synth.tls.certresolver=cloudflare"
      - "traefik.http.services.synth.loadbalancer.server.port=3080"
      - "traefik.docker.network=agent-net"
```

- [ ] **Step 4: Build and start**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cd ~/docker/synth-stack && docker compose up -d --build"
```

- [ ] **Step 5: Verify**

```bash
curl -s https://synth.zb.example.com/health/detailed | python3 -m json.tool
```

---

## Task 5: Deploy Dashboard

- [ ] **Step 1: Copy dashboard to VM**

```bash
rsync -av --exclude='node_modules' --exclude='.next' --exclude='.env' \
  /Volumes/nvme-2tb/ant-workspace/z-brain/dashboard/ \
  YOUR_VM_USER@YOUR_VM_IP:~/docker/dashboard/
```

- [ ] **Step 2: Create .env on VM**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cat > ~/docker/dashboard/.env << 'ENVEOF'
SYNTH_DB_HOST=synth-postgres
SYNTH_DB_PORT=5432
SYNTH_DB_NAME=synthesizer_db
SYNTH_DB_USER=synth
SYNTH_DB_PASSWORD=synthpostgres1234

OPENBRAIN_URL=http://openbrain-server:3040
SYNTH_APP_URL=http://synth-app:3080
HERMES_URL=http://hermes-agent:8642
HERMES_API_KEY=REPLACE_WITH_HERMES_API_KEY

DASHBOARD_PORT=3090
ENVEOF"
```

- [ ] **Step 3: Update dashboard docker-compose with Traefik labels**

The dashboard's docker-compose.yml should have labels for `dash.zb.example.com`:

```yaml
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`dash.zb.example.com`)"
      - "traefik.http.routers.dashboard.entrypoints=websecure"
      - "traefik.http.routers.dashboard.tls=true"
      - "traefik.http.routers.dashboard.tls.certresolver=cloudflare"
      - "traefik.http.services.dashboard.loadbalancer.server.port=3090"
      - "traefik.docker.network=agent-net"
```

- [ ] **Step 4: Build and start**

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cd ~/docker/dashboard && docker compose up -d --build"
```

- [ ] **Step 5: Verify**

Open `https://dash.zb.example.com` — you should see the Z-Brain Dashboard.

---

## Task 6: Wire Webhooks

### Zulip → Synthesizer

- [ ] **Step 1: Create outgoing webhook bot in Zulip**

1. Log into `https://chat.zb.example.com`
2. Go to **Settings → Organization → Bots**
3. Click **Add a new bot**:
   - Name: `Memory Synthesizer`
   - Type: **Outgoing webhook**
   - Endpoint URL: `http://synth-app:3080/webhooks/zulip?secret=zulip_synth_secret_2026`
4. Subscribe the bot to relevant streams (e.g., `engineering`, `homelab`, `decisions`)

### Wiki.js → Synthesizer

- [ ] **Step 2: Configure Wiki.js webhooks**

1. Log into `https://wiki.zb.example.com`
2. Go to **Administration → Webhooks**
3. Add webhook:
   - URL: `http://synth-app:3080/webhooks/wikijs?secret=wikijs_synth_secret_2026`
   - Events: `page:created`, `page:updated`

> **Note:** Both webhook URLs use internal Docker hostnames (`synth-app:3080`), not the public subdomain. The containers communicate directly over `agent-net`.

---

## Task 7: End-to-End Verification

- [ ] **Step 1: Verify all services are accessible**

```bash
echo "--- Traefik ---"
curl -sI https://traefik.zb.example.com | head -3

echo "--- Dashboard ---"
curl -sI https://dash.zb.example.com | head -3

echo "--- Zulip ---"
curl -sI https://chat.zb.example.com | head -3

echo "--- Wiki.js ---"
curl -sI https://wiki.zb.example.com | head -3

echo "--- Synthesizer ---"
curl -s https://synth.zb.example.com/health | python3 -m json.tool

echo "--- Core ---"
curl -sI https://core.zb.example.com | head -3
```

- [ ] **Step 2: Send a test Zulip message**

Post in a subscribed stream:
```
We decided to use Traefik as our reverse proxy. Command: docker ps --filter name=traefik
```

- [ ] **Step 3: Verify pipeline flow**

```bash
# Check Synthesizer received the event
curl -s https://synth.zb.example.com/health/detailed | python3 -m json.tool
```

Open `https://dash.zb.example.com/pipeline` — the test message should appear.

- [ ] **Step 4: Create a test Wiki page**

In Wiki.js, create a page at `homelab/test` with some content. Verify it appears in the Dashboard pipeline.

- [ ] **Step 5: Check OpenBrain for committed memories**

If the LLM extraction and commit succeeded, search OpenBrain:

```bash
# Via MCP or direct API
curl -s "http://YOUR_VM_IP:3040/search?q=Traefik+reverse+proxy" | python3 -m json.tool
```

---

## Final Architecture

```
VM YOUR_VM_IP — Docker on agent-net
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  traefik (ports 80, 443)
  ├── *.zb.example.com → Let's Encrypt wildcard cert
  ├── Cloudflare DNS-01 challenge (no internet exposure)
  └── Routes:
      ├── traefik.zb.example.com → Traefik dashboard (8080)
      ├── dash.zb.example.com    → zbrain-dashboard (3090)
      ├── chat.zb.example.com    → zulip (80)
      ├── wiki.zb.example.com    → wikijs (3000)
      ├── core.zb.example.com    → core-app (3033)
      ├── hermes.zb.example.com  → hermes-agent (8642)
      └── synth.zb.example.com   → synth-app (3080)

  core-stack (existing)
    core-app, core-postgres, core-redis, core-neo4j
    openbrain-server

  hermes-stack (existing)
    hermes-agent

  zulip-stack (NEW)
    zulip, zulip-database, zulip-memcached, zulip-rabbitmq, zulip-redis

  wikijs-stack (NEW)
    wikijs, wikijs-database

  synth-stack (NEW)
    synth-app, synth-postgres

  dashboard (NEW)
    zbrain-dashboard

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Data flow:
  Zulip msg  →  webhook  →  synth-app  →  LLM  →  OpenBrain
  Wiki edit  →  webhook  →  synth-app  →  LLM  →  OpenBrain
  Dashboard reads synth-postgres + OpenBrain + Hermes
```
