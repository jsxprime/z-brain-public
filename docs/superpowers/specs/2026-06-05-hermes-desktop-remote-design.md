# Hermes Desktop → Remote VM Backend via `zella.zb.example.com`

**Date:** 2026-06-05
**Session:** 7f254e83
**Status:** DRAFT — awaiting cross-model review and user approval

---

## Goal

Install the Hermes Desktop macOS app on 3 Macs and connect them all to the existing Hermes Agent (Zella) running on the Z-Brain VM (`YOUR_VM_IP`). The desktop app should provide a native GUI chat experience plus the full dashboard (session browser, skill manager, cron viewer, memory browser) as a replacement for — or supplement to — the current Telegram interface.

## Background & Current State

### What exists today
- **hermes-agent v0.15.2** runs as a Docker container on `YOUR_VM_IP`
- The **gateway** is running on port `8642` with Telegram + API server platforms connected
- The **dashboard** is **already enabled** (`HERMES_DASHBOARD=1`, `HERMES_DASHBOARD_INSECURE=1`) and responding on port `9119` — confirmed live at `/api/status`
- Port `9119` is **already exposed** in docker-compose.yml
- **Traefik** reverse proxy runs on the same VM with a wildcard Let's Encrypt cert for `*.zb.example.com` (Cloudflare DNS-01 challenge)
- The dashboard currently has **no authentication** (`auth_required: false`, no `BASIC_AUTH` vars in `.env`)

### What the desktop app needs
From reading `apps/desktop/electron/main.cjs` in the container:
- The desktop app's `resolveRemoteBackend()` function connects to a remote URL via:
  1. Env vars: `HERMES_DESKTOP_REMOTE_URL` + `HERMES_DESKTOP_REMOTE_TOKEN`
  2. Settings UI: writes `{ mode: 'remote', remote: { url, token } }` to a connection config file
- It constructs a WebSocket URL: `wss://<host>/api/ws?token=<token>`
- It probes `/api/status` to verify the backend is reachable
- It uses `/api/sessions`, `/api/sessions/{id}/chat/stream`, and other REST endpoints for the full UI

### Key discovery
The dashboard process is **already running** inside the container. The only work needed is:
1. Replace insecure mode with basic auth
2. Add Traefik routing for the FQDN
3. Install the desktop app on 3 Macs

---

## Architecture

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Mac #1      │  │  Mac #2      │  │  Mac #3      │
│  (IDE Mac)   │  │  (laptop)    │  │  (other)     │
│  Hermes      │  │  Hermes      │  │  Hermes      │
│  Desktop     │  │  Desktop     │  │  Desktop     │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       │    HTTPS / WSS (port 443)         │
       └─────────┬───────┴─────────┬───────┘
                 │                 │
                 ▼                 ▼
       ┌─────────────────────────────┐
       │  Traefik (YOUR_VM_IP:443)  │
       │  zella.zb.example.com         │
       │  TLS termination            │
       │  WebSocket passthrough      │
       └──────────┬──────────────────┘
                  │ proxy → hermes-agent:9119
       ┌──────────▼──────────────────┐
       │  hermes-agent container     │
       │  ├─ Gateway (:8642)         │
       │  │   ├─ Telegram platform   │
       │  │   └─ API server          │
       │  ├─ Dashboard (:9119)       │ ← basic auth gate
       │  │   ├─ REST API            │
       │  │   ├─ WebSocket /api/ws   │
       │  │   └─ Web UI (React)      │
       │  └─ MCP servers (6)         │
       └─────────────────────────────┘
```

- **DNS**: `zella.zb.example.com` → `YOUR_VM_IP` (already covered by `*.zb.example.com` Cloudflare wildcard)
- **TLS**: Traefik terminates HTTPS using the existing wildcard cert
- **Auth**: Dashboard's built-in basic auth gate (activated when bound to non-loopback)
- **WebSocket**: Traefik passes through WebSocket upgrades by default (no special config needed)

---

## Proposed Changes

### 1. VM: docker-compose.yml — Add Traefik labels + auth env vars

**File:** `~/docker/hermes-stack/docker-compose.yml` (on VM, then sync to local git)

```yaml
# Hermes Agent Stack

services:
  hermes-agent:
    image: nousresearch/hermes-agent@sha256:52d353b47aaae912a3018f80f4ee72ff49f940a0ff5613e4983d18328bbccc8a  # v0.15.2
    container_name: hermes-agent
    restart: unless-stopped
    command: gateway run
    ports:
      - "8642:8642"
      # Port 9119 no longer needs host binding — Traefik routes via Docker network
      # Keep it for direct LAN access as fallback:
      - "9119:9119"
    environment:
      - HERMES_HOME=/opt/data
      - API_SERVER_ENABLED=true
      - API_SERVER_HOST=0.0.0.0
      - API_SERVER_KEY=${API_SERVER_KEY}
      - HERMES_DASHBOARD=1
      # REMOVED: HERMES_DASHBOARD_INSECURE=1
      # Basic auth — credentials loaded from .env
      - HERMES_DASHBOARD_BASIC_AUTH_USERNAME=${HERMES_DASHBOARD_BASIC_AUTH_USERNAME}
      - HERMES_DASHBOARD_BASIC_AUTH_PASSWORD=${HERMES_DASHBOARD_BASIC_AUTH_PASSWORD}
      - HERMES_DASHBOARD_BASIC_AUTH_SECRET=${HERMES_DASHBOARD_BASIC_AUTH_SECRET}
      - CLAUDE_CODE_OAUTH_TOKEN=${CLAUDE_CODE_OAUTH_TOKEN}
    volumes:
      - ./data:/opt/data
      - ./cli-secrets:/opt/data/cli-secrets
      - ./mcp:/opt/mcp
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - agent-net
    labels:
      # Traefik: Hermes Dashboard at zella.zb.example.com
      - "traefik.enable=true"
      - "traefik.http.routers.zella-dash.rule=Host(`zella.zb.example.com`)"
      - "traefik.http.routers.zella-dash.entrypoints=websecure"
      - "traefik.http.routers.zella-dash.tls=true"
      - "traefik.http.routers.zella-dash.tls.certresolver=cloudflare"
      - "traefik.http.services.zella-dash.loadbalancer.server.port=9119"
      - "traefik.docker.network=agent-net"

networks:
  agent-net:
    external: true
```

**Key changes:**
- **Removed** `HERMES_DASHBOARD_INSECURE=1` — this disables the insecure flag, which means the dashboard will enforce auth when accessed from non-loopback
- **Added** 3 basic auth env vars referencing `.env` file
- **Added** Traefik labels following the same pattern as wiki.js and synth-app

### 2. VM: .env — Add dashboard credentials

**File:** `~/docker/hermes-stack/.env` (on VM, NOT in git)

Add these lines:
```bash
# Hermes Dashboard Basic Auth
HERMES_DASHBOARD_BASIC_AUTH_USERNAME=jay
HERMES_DASHBOARD_BASIC_AUTH_PASSWORD=<strong-password-here>
HERMES_DASHBOARD_BASIC_AUTH_SECRET=<output-of-openssl-rand-base64-32>
```

The `BASIC_AUTH_SECRET` signs session cookies so they survive app/container restarts. Generate it once and don't change it unless you want to invalidate all sessions.

### 3. VM: Container restart

```bash
ssh YOUR_VM_USER@YOUR_VM_IP "cd ~/docker/hermes-stack && docker compose up -d"
```

This is a non-destructive restart — all state is in bind-mounted volumes (`./data:/opt/data`). Sessions, memory, config, SOUL.md all persist.

### 4. Verification — Dashboard accessible via FQDN

```bash
# From any machine on the network:
curl -s https://zella.zb.example.com/api/status

# Should return 401 (auth required) instead of the current 200
# With credentials:
curl -s -u jay:<password> https://zella.zb.example.com/api/status
# Should return JSON with version, gateway_running, etc.
```

### 5. Each Mac: Install Hermes Desktop

1. Download from https://hermes-agent.nousresearch.com/desktop
2. Install the `.dmg` on each Mac
3. On first launch, the app may try to install a local Hermes backend — skip this or let it complete (we won't use it)
4. Go to **Settings → Gateway → Remote connection**
5. Set:
   - **Mode:** Remote
   - **Remote URL:** `https://zella.zb.example.com`
   - **Username:** `jay`
   - **Password:** `<the password set in .env>`
6. Click **Test** — should show the backend version
7. Save and reconnect

Repeat on all 3 Macs.

---

## Risk Assessment

### Low risk
- **Data loss**: Zero — all state is in bind-mounted volumes, not the container
- **Traefik routing**: Same pattern used by 4 other services (wiki, synth, dash, chat). Known to work.
- **Dashboard co-process**: Already running and confirmed responding at `:9119/api/status`

### Medium risk
- **WebSocket through Traefik**: Traefik v3 handles WebSocket upgrades by default, but if the dashboard uses long-lived connections with unusual keep-alive, we may need to adjust timeouts. Mitigation: test from desktop app before declaring success.
- **Desktop app version compatibility**: We're running Hermes v0.15.2 (container). The desktop app downloads from the website will be the latest release. There could be API incompatibility if the desktop app expects endpoints that don't exist in v0.15.2. Mitigation: check `/api/status` version field, review release notes if mismatch.
- **HERMES_DASHBOARD_INSECURE removal**: Need to verify that removing this flag doesn't break the dashboard startup. The basic auth env vars should be the replacement. If the dashboard refuses to start without either insecure mode or valid auth credentials, we must ensure the auth vars are set before restarting.

### Considerations
- **Auth scope**: Basic auth protects the dashboard (port 9119). The API server (port 8642) remains protected by `API_SERVER_KEY` separately. These are independent auth mechanisms.
- **Simultaneous connections**: All 3 Macs + Telegram can connect simultaneously. The dashboard handles multiple WebSocket clients.
- **Session continuity**: Telegram conversations appear in the desktop app's session browser. Desktop conversations appear in Telegram's session search. Same `state.db`, same memory.

---

## What You Get After This

| Feature | Telegram (current) | Desktop App (new) |
|---------|-------------------|-------------------|
| Chat with Zella | ✅ | ✅ |
| Streaming responses | ✅ | ✅ |
| Session history | via `/sessions` command | Visual session browser |
| File/code preview | Markdown in chat | Side-by-side preview |
| Cron jobs | via `/cron` command | Visual cron manager |
| Skills | via commands | Visual skill browser |
| Memory | via commands | Memory browser UI |
| MCP tools | via commands | Visual tool list |
| Voice mode | ✅ | ✅ (if configured) |
| Multiple Macs | N/A (phone only) | ✅ 3 simultaneous |
| HTTPS/WSS | ✅ (Telegram servers) | ✅ (Traefik TLS) |

---

## Rollback Plan

If the desktop app doesn't work or the dashboard breaks:

1. Re-add `HERMES_DASHBOARD_INSECURE=1` to docker-compose.yml
2. Remove the basic auth env vars
3. `docker compose up -d` to restart
4. Dashboard returns to previous unauthenticated state
5. Remove Traefik labels if desired

The gateway (port 8642) and Telegram are completely unaffected by dashboard changes.

---

## Out of Scope (Future)

- Installing the Hermes CLI locally on the Macs (not needed for desktop app)
- Upgrading the container from v0.15.2 (separate task)
- Computer Use / Accessibility permissions on macOS (only needed if using desktop computer-use features)
- Configuring voice mode through the desktop app
