# Superpowers Deployment Status

**Last Updated:** 2026-05-22 (Session 1)

---

## 1. Project Overview & Current State

We have successfully deployed the **CORE Memory OS** (`RedPlanetHQ/core`) on the home lab VM. The application and databases are healthy, and the setup flow (butler naming, user creation, workspace seeding) has been completed and verified.

*   **System Name:** This VM host and the running stack (CORE + Hermes Agent) are collectively referred to as **z-brain**.
*   **Host IP:** `YOUR_VM_IP`
*   **User:** `YOUR_VM_USER`
*   **Deployment Directories on Host:** 
    *   CORE Stack: `~/docker/core-stack/`
    *   Hermes Stack: `~/docker/hermes-stack/`
*   **Access URL (Local Network):** `http://YOUR_VM_IP:3033` (exposes port `3033`)

---

## 2. Infrastructure & Services Deployed

The deployment runs via isolated Docker Compose stacks on the host VM:

### CORE Memory Stack (`~/docker/core-stack/`)
1.  **`core-app`:** Remix-based application server. Exposes host port `3033:3033`. Custom build includes a client-side polyfill to allow insecure context API calls.
2.  **`postgres`:** PostgreSQL 15 running official `pgvector/pgvector:pg15` to enable spatial/vector embeddings.
3.  **`neo4j`:** Neo4j 5 Community Edition for temporal knowledge graphs.
4.  **`redis`:** Redis 7 for queue and caching.

*All databases use persistent local bind mounts mapped to `~/docker/core-stack/data/*`.*

### Hermes Agent Stack (`~/docker/hermes-stack/`)
1.  **`hermes-agent`:** Isolated container for the Hermes Agent gateway. Exposes ports `8642:8642` (API) and `9119:9119` (Dashboard). Mounts configurations locally to `./data` and joins the external `agent-net` overlay network. Features a configured API server and Web UI.

---

## 3. Configuration & Secrets

The environment configurations in `~/docker/core-stack/.env` are:
*   **`QUEUE_PROVIDER=bullmq`**: Set explicitly to bypass Trigger.dev cloud validation.
*   **`REMIX_APP_PORT=3033`**: Configures the Remix server port inside the container.
*   **`APP_ORIGIN` & `LOGIN_ORIGIN`**: Pointing to `http://YOUR_VM_IP:3033` for local network setup.
*   **`ENCRYPTION_KEY`**: Exactly 32 characters (ASCII/UTF-8) to meet `aes-256-gcm` requirements.

---

## 4. Key Troubleshooting & Fixes Applied

During deployment, the following major blockers were solved:
1.  **BullMQ Concurrency Crash:** Set `QUEUE_PROVIDER=bullmq` to resolve issues where the schema validation failed, resulting in `concurrency must be a finite number` errors.
2.  **Missing `vector` SQL Extension:** Migrated database container image to `pgvector/pgvector:pg15` and provisioned tables using `npx prisma db push --accept-data-loss`.
3.  **Cryptographic Key Size Crash (`ERR_CRYPTO_INVALID_KEYLEN`):** Node's `crypto.createCipheriv` with `aes-256-gcm` requires a 32-byte key. The auto-generated key was 64 characters (64 bytes). Truncated the key to 32 characters.
4.  **Browser Secure Context Crash (`crypto.randomUUID`):** Browser-side Javascript crashed when accessing over insecure HTTP. Added a pseudo-random UUID generator polyfill to `entry.client.tsx` as a fallback.
5.  **API Server Bind Config (`API_SERVER_HOST`):** Changed the host bind address in the container volume `.env` (`~/docker/hermes-stack/data/.env`) from `127.0.0.1` to `0.0.0.0` so the API server is exposed for host-level routing and tunnels.
6.  **Agent-to-Host SSH Authentication:** Appended the container's public SSH key (`/opt/data/.ssh/id_ed25519.pub`) to the host VM's `~/.ssh/authorized_keys` to allow the agent to execute terminal tools on the host cleanly without password prompts or host verification warnings.

---

## 5. What's Next?

When starting the next session, here is the prioritized checklist:

- [ ] **Task 1: Expose stack securely via Pangolin Tunnel**
  - Configure a Pangolin `newt` tunnel container joined to the `agent-net` overlay network.
  - Expose CORE via HTTPS on `core.example.com`.
  - Re-adjust `APP_ORIGIN` and `LOGIN_ORIGIN` in `.env` to `https://core.example.com` once the tunnel is active.
- [ ] **Task 2: Integrate Nate B. Jones' Open Brain (OB1)**
  - Spin up Supabase/pgvector relational structures as a secondary memory/infrastructure layer.
- [x] **Task 3: Install and configure Hermes Agent**
  - Deployed in isolated stack `~/docker/hermes-stack/`. Exposes gateway API on port `8642`. Configured and verified.
- [ ] **Task 4: Integrate Zero Claw**
  - Deploy the Zero Claw runner and configure it to talk to the stable CORE API.
