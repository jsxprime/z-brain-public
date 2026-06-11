# Z-Brain Memory Review — Implementation Follow-up

**Reviewer**: Claude Fable 5 (claude-fable-5)
**Date**: 2026-06-10
**Parent**: `docs/reports/claude/2026-06-10_fable5-memory-review.md`

Grounding: Q2 Cypher is written against the *actual* schema in `hermes-stack/mcp/neo4j-memory/index.js` (`(:Entity {name, type, observations})`, `[:RELATED_TO {type}]`). Q3's job entry matches the *actual* format in `hermes-stack/data/cron/jobs.json` (synced from VM 2026-06-05).

---

## Q1 — Diagnostic playbook: intermittently crashing `core-app`

Run on the VM (`ssh YOUR_VM_USER@YOUR_VM_IP`). Phases are ordered so evidence is captured before it's destroyed. All commands are read-only except where marked.

### Phase 0 — Freeze the facts (30 seconds, do this first)

```bash
docker inspect core-app --format '{{json .State}}' | jq
docker inspect core-app --format 'RestartCount={{.RestartCount}} Policy={{.HostConfig.RestartPolicy.Name}} MemLimit={{.HostConfig.Memory}} PidsLimit={{.HostConfig.PidsLimit}}'
```

Decision table for `.State`:

| Evidence | Meaning | Next move |
|---|---|---|
| `OOMKilled: true` or `ExitCode: 137` | cgroup OOM kill (kernel killed it) | Phase 3 + 4 — memory limit vs heap |
| `ExitCode: 134` or logs say "JavaScript heap out of memory" | Node V8 heap OOM (killed itself) | `--max-old-space-size` mismatch, Phase 4 |
| `ExitCode: 139` | Segfault — almost always a native module (sharp, onnx, db client binaries) | Phase 2 logs, check recent `npm`/image changes |
| `ExitCode: 1` + stack trace in logs | Unhandled exception/rejection | Phase 2 — read the stack, likely a poison job (Phase 6) |
| `ExitCode: 0`, restarts anyway | Something *external* is restarting it (autoheal, watchtower, healthcheck supervisor, compose redeploy) | Phase 5 |

Caveat: `OOMKilled` is unreliable on some runtimes — a 137 with `OOMKilled: false` can still be a kernel OOM kill. dmesg (Phase 3) is the ground truth.

### Phase 1 — Restart timeline (correlate with the 38h gap)

```bash
docker events --since 48h --until now \
  --filter container=core-app \
  --format '{{.Time}} {{.Action}} {{.Actor.Attributes.exitCode}}'
journalctl -u docker --since "48 hours ago" --no-pager | grep -i core-app
```

The Docker daemon replays past events with `--since` — this gives exact timestamps for every `die`/`start` plus the exit code at each death. **Key question: does the first `die` event line up with June 9 04:18 UTC (last ingested episode)?** If yes, one root cause. If the gap predates the first crash, you have two problems — and note the gap start is suspiciously close to the `EMBEDDING_MODEL_SIZE` 768→1024 fix (commit `02e5fd3`); check when that env change was applied vs. when ingestion stopped.

### Phase 2 — Last words before each death

`docker logs` survives container restarts (same container, same log file) — it only resets on *recreation* (`compose up` with config change). Since these are solo restarts, the pre-crash lines are all there:

```bash
# Targeted sweep across the whole window
docker logs core-app --since 48h --timestamps 2>&1 | \
  grep -iE 'fatal|heap|out of memory|segfault|unhandled|uncaught|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EADDRINUSE|ENOSPC|exit|SIGTERM|SIGKILL' | tail -60

# Then read the 30 lines immediately before each restart timestamp from Phase 1:
docker logs core-app --since "2026-06-10T14:00:00" --until "2026-06-10T14:05:00" --timestamps 2>&1 | tail -40
```

What to look for, in order of likelihood for this app:
1. **A BullMQ job name/ID appearing right before every death** → poison job (Phase 6).
2. **"JavaScript heap out of memory" + GC stats** → V8 heap exhaustion, often one huge episode payload in the extraction/embedding step.
3. **Nothing — logs just stop mid-line** → SIGKILL from outside (kernel OOM or supervisor). Phase 3/5.
4. **`ECONNREFUSED`/`ETIMEDOUT` to `core-redis`/`core-postgres`/`YOUR_OLLAMA_HOST:11434`** → a dependency blip turning into an unhandled rejection. Check whether the *dependency* also restarted at that time (`docker events --since 48h --filter container=core-redis` etc.).

### Phase 3 — Was it the kernel OOM killer?

```bash
sudo dmesg -T | grep -iE 'oom|killed process' | tail -30
sudo journalctl -k --since "48 hours ago" --no-pager | grep -iE 'out of memory|oom-kill|killed process'
free -h && df -h / /var/lib/docker
```

A line like `Killed process 12345 (node) total-vm:... anon-rss:...` with a cgroup path containing core-app's container ID is conclusive. Also check `df` — a full `/var/lib/docker` produces bizarre intermittent Node crashes (and will take core-postgres down next).

### Phase 4 — Memory ceiling vs. Node heap (the classic Docker/Node footgun)

```bash
docker inspect core-app --format '{{.HostConfig.Memory}}'        # container limit, bytes; 0 = unlimited
docker exec core-app node -p 'require("v8").getHeapStatistics().heap_size_limit / 1048576 + " MB heap limit"'
docker exec core-app sh -c 'echo $NODE_OPTIONS'
docker stats core-app --no-stream
```

If the container limit is, say, 2 GB and V8's heap limit is ≥ that (default ~4 GB on a 64-bit box, unless Node ≥18 detects cgroups), Node grows past the cgroup ceiling and gets SIGKILLed before V8 ever feels pressure to GC hard. Fix: in `core-stack/docker-compose.yml`, set `NODE_OPTIONS=--max-old-space-size=<75% of container limit in MB>` on core-app. If no container limit is set, the kernel kills the biggest process on the *VM* under pressure — check what else spiked (22 containers on one VM; Zulip + Neo4j are heavy).

To catch a slow leak vs. a spike, leave a sampler running between crashes:

```bash
nohup sh -c 'while true; do echo "$(date -Is) $(docker stats core-app --no-stream --format "{{.MemUsage}} {{.CPUPerc}}")" >> /tmp/core-app-mem.log; sleep 30; done' >/dev/null 2>&1 &
```

Sawtooth climbing to the limit before each restart = leak/oversized job. Flat then instant death = external kill or fatal exception.

### Phase 5 — Rule out an external restarter

```bash
docker inspect core-app --format '{{json .Config.Healthcheck}}' | jq
docker inspect core-app --format '{{json .State.Health}}' | jq '.Status, .FailingStreak, (.Log[-5:])'
docker ps --format '{{.Names}}' | grep -iE 'autoheal|watchtower|ouroboros'
grep -n 'core-app' ~/.hermes/scripts/*.sh 2>/dev/null   # Docker Stack Monitor cron scripts
```

Two things specific to this stack: (a) Docker's own restart policy does **not** restart unhealthy containers — if `Health.Status` flaps and the container restarts anyway, something like autoheal or a monitor script is doing it; (b) a `docker-event-monitor.sh` Hermes cron runs every 5 minutes (`jobs.json` id `55b822f73bb4`) — read it and `fs-monitor.sh` to confirm neither has a "remediation" path that bounces containers. A well-meaning auto-restart script is exactly how "solo restarts, root cause unknown" happens.

### Phase 6 — The poison-job hypothesis (most likely root cause given the symptom pair)

A crash-looping worker + a stalled ingestion queue is the signature of a poison job: container starts → BullMQ picks up the same stalled `ingest-episode` job → job kills the process (heap, segfault, fatal throw) → restart → repeat. The queue never advances, so the episodic gap grows while every *other* queue looks "healthy, 0 failed" (the job never lives long enough to be *marked* failed — it returns to `active`/`wait` as stalled).

```bash
docker exec core-redis redis-cli --scan --pattern 'bull:*' | sed 's/:[^:]*$//' | sort -u   # queue names
for q in ingest-episode preprocess-episode session-compaction label-assignment title-generation; do
  echo "== $q =="
  docker exec core-redis redis-cli llen "bull:$q:wait"
  docker exec core-redis redis-cli llen "bull:$q:active"
  docker exec core-redis redis-cli zcard "bull:$q:failed"
  docker exec core-redis redis-cli zcard "bull:$q:delayed"
done
# Inspect the job at the head of the line — its payload is the suspect episode:
docker exec core-redis redis-cli lrange bull:ingest-episode:active 0 0
docker exec core-redis redis-cli hgetall "bull:ingest-episode:<that-job-id>"
```

Look at the suspect job's payload size and `attemptsMade`. If `attemptsMade` climbs in lockstep with the restart count, that's the one. Remediation (state-changing — only after confirming): move that one job to failed or delete its hash, let the queue drain, then fix the underlying cause (usually: cap episode payload size before embedding, or add a per-job memory guard).

### Exit criteria

You're done diagnosing when you can fill in this sentence with evidence: *"core-app dies with exit code __ at times __, because __ (log line / dmesg line / job ID), and the episodic gap started [before/at] the first death."* Then fix that one thing, and add the **memory-freshness alarm** (recommendation #1 from the main review) so the next gap announces itself in hours, not days.

---

## Q2 — Neo4j entity dedup: audit, merge, prevent

Schema (verified in `hermes-stack/mcp/neo4j-memory/index.js`): nodes `(:Entity {name, type, observations})` where `observations` is a `'; '`-joined string; all edges are `[:RELATED_TO {type}]`. This makes a pure-Cypher merge fully deterministic — no APOC required.

**Confirmation from the source code**: the current `add_relations` (index.js:158-164) does `MERGE (a)-[r:RELATED_TO]->(b)` on bare geometry and then `SET r.type` — between any two given nodes it can *never* create a second edge. So the observed duplicates are mathematically guaranteed to be duplicate **endpoint nodes** (same entity, multiple `:Entity` nodes differing by case/whitespace, since `MERGE (e:Entity {name: $name})` is exact-match). Side discovery: that same code means **only one relation of any type can exist per entity pair — each new `relationType` silently overwrites the previous one.** That's a data-loss bug independent of the duplicates; the write-time fix below repairs both.

### Pre-flight (mandatory)

`core-neo4j` is shared with CORE's own pipeline. CORE-written entity nodes (if they share the `:Entity` label) are keyed by UUID and referenced from statements — merging those by name would corrupt CORE. Check before running anything:

```cypher
// What labels exist, and what property shapes do :Entity nodes have?
MATCH (n) WITH labels(n) AS ls, count(*) AS c RETURN ls, c ORDER BY c DESC;
MATCH (n:Entity) UNWIND keys(n) AS k RETURN k, count(*) AS c ORDER BY c DESC;
```

If any `:Entity` nodes carry a `uuid` (or other CORE-style keys), add `AND n.uuid IS NULL` to **every** `MATCH (n:Entity)` below so the script touches only MCP-written nodes.

**Backup** (Community Edition can't dump a running DB; the volume copy is the cheap honest backup):

```bash
docker inspect core-neo4j --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
docker stop core-neo4j
sudo tar czf ~/neo4j-data-$(date +%F).tgz -C <volume-source-dir> .
docker start core-neo4j
```

Run everything below via:

```bash
docker exec -i core-neo4j cypher-shell -u neo4j -p "$NEO4J_PASSWORD" < dedup.cql
```

### (a) Audit — identify duplicate entity nodes

```cypher
MATCH (n:Entity)
WITH toLower(trim(n.name)) AS key, collect(n) AS nodes
WHERE size(nodes) > 1
RETURN key,
       size(nodes) AS copies,
       [x IN nodes | {
          name: x.name,
          type: x.type,
          degree: COUNT { (x)--() },
          obs_len: size(coalesce(x.observations, ''))
       }] AS details
ORDER BY copies DESC, key;
```

Expect your 17+ rows. Eyeball `details` — if two nodes under one key are genuinely different things that happen to share a lowercased name, handle them manually and exclude them from the script.

### (b)+(c) Merge — full script (`dedup.cql`)

Statements are separated by `;` and run in order. Winner = highest relationship degree, tiebreak longest observations, then `elementId` for determinism. Losers are tagged with a pointer to their winner so every later statement resolves the same pairing.

```cypher
// ── 1. Tag each loser with its winner's elementId ─────────────────────
MATCH (n:Entity)
WITH n, toLower(trim(n.name)) AS key,
     COUNT { (n)--() } AS degree,
     size(coalesce(n.observations, '')) AS obs_len
ORDER BY degree DESC, obs_len DESC, elementId(n) ASC
WITH key, collect(n) AS nodes
WHERE size(nodes) > 1
WITH nodes[0] AS winner, nodes[1..] AS losers
UNWIND losers AS loser
SET loser._merge_into = elementId(winner);

// ── 2. Fold loser properties into the winner ─────────────────────────
MATCH (loser:Entity) WHERE loser._merge_into IS NOT NULL
MATCH (winner:Entity) WHERE elementId(winner) = loser._merge_into
SET winner.type = coalesce(winner.type, loser.type),
    winner.observations = CASE
      WHEN coalesce(loser.observations, '')  = '' THEN winner.observations
      WHEN coalesce(winner.observations, '') = '' THEN loser.observations
      WHEN winner.observations CONTAINS loser.observations THEN winner.observations
      ELSE winner.observations + '; ' + loser.observations
    END;

// ── 3. Rewire OUTGOING edges: loser→X becomes winner→X ───────────────
//     (X is resolved to *its* winner too, in case both ends are losers)
MATCH (loser:Entity) WHERE loser._merge_into IS NOT NULL
MATCH (winner:Entity) WHERE elementId(winner) = loser._merge_into
MATCH (loser)-[r:RELATED_TO]->(t:Entity)
OPTIONAL MATCH (tw:Entity) WHERE elementId(tw) = t._merge_into
WITH winner, r, coalesce(tw, t) AS target
WHERE elementId(target) <> elementId(winner)
MERGE (winner)-[:RELATED_TO {type: r.type}]->(target)
DELETE r;

// ── 4. Rewire INCOMING edges: X→loser becomes X→winner ───────────────
MATCH (loser:Entity) WHERE loser._merge_into IS NOT NULL
MATCH (winner:Entity) WHERE elementId(winner) = loser._merge_into
MATCH (s:Entity)-[r:RELATED_TO]->(loser)
OPTIONAL MATCH (sw:Entity) WHERE elementId(sw) = s._merge_into
WITH winner, r, coalesce(sw, s) AS source
WHERE elementId(source) <> elementId(winner)
MERGE (source)-[:RELATED_TO {type: r.type}]->(winner)
DELETE r;

// ── 5. Delete the losers (any leftover edges are loser↔winner strays) ─
MATCH (loser:Entity) WHERE loser._merge_into IS NOT NULL
DETACH DELETE loser;

// ── 6. Collapse the original symptom: parallel duplicate edges ───────
MATCH (a:Entity)-[r:RELATED_TO]->(b:Entity)
WITH a, b, r.type AS reltype, collect(r) AS rels
WHERE size(rels) > 1
FOREACH (extra IN rels[1..] | DELETE extra);

// ── 7. Remove self-loops, if any survived ─────────────────────────────
MATCH (a:Entity)-[r:RELATED_TO]->(a)
DELETE r;
```

(If APOC turns out to be installed — `RETURN apoc.version()` — steps 2–5 collapse into one `apoc.refactor.mergeNodes(nodes, {mergeRels: true, properties: {name:'discard', type:'discard', observations:'combine'}})` call on the degree-sorted collections from step 1. The pure-Cypher version above is what I'd actually run: `'combine'` turns the observation strings into an array, which the `search_entities` JSON output and the `'; '` convention don't expect.)

### Verify

```cypher
// Both must return zero rows:
MATCH (n:Entity)
WITH toLower(trim(n.name)) AS key, count(*) AS c
WHERE c > 1 RETURN key, c;

MATCH (a:Entity)-[r:RELATED_TO]->(b:Entity)
WITH a, b, r.type AS t, count(r) AS c
WHERE c > 1 RETURN a.name, t, b.name, c;
```

Then retire the dedup pass from the `e4dbe4fd` KG Auto-Update cron — it's been treating this symptom on a schedule.

### Write-time fix — prevent recurrence

Three parts: a normalized key, a uniqueness constraint to make violation impossible, and a corrected relation MERGE. All in `hermes-stack/mcp/neo4j-memory/index.js`.

**Migration (run once, after the dedup above):**

```cypher
MATCH (e:Entity) WHERE e.name_key IS NULL
SET e.name_key = toLower(trim(e.name));

CREATE CONSTRAINT entity_name_key IF NOT EXISTS
FOR (e:Entity) REQUIRE e.name_key IS UNIQUE;
```

(The constraint doubles as a guard: it refuses to be created if duplicates remain.)

**Code changes:**

```js
// top of index.js
const normKey = (s) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
```

`add_entities` handler — MERGE on the key, keep a display name, *append* observations instead of clobbering them (the current `SET e.observations = $obs` destroys prior observations on every re-add — second latent bug):

```js
await session.run(
  `MERGE (e:Entity {name_key: $key})
   ON CREATE SET e.name = $name, e.created_at = datetime()
   SET e.type = coalesce($type, e.type),
       e.observations = CASE
         WHEN $obs = '' THEN e.observations
         WHEN e.observations IS NULL OR e.observations = '' THEN $obs
         WHEN e.observations CONTAINS $obs THEN e.observations
         ELSE e.observations + '; ' + $obs
       END`,
  { key: normKey(entity.name), name: entity.name.trim(), type: entity.entityType ?? null, obs }
);
```

`add_relations` handler — match by key, put `type` *inside* the MERGE pattern (one edge per (pair, type) — fixes both duplicates and the type-overwrite bug), and stamp the temporal fields from review recommendation #8 while you're in here:

```js
await session.run(
  `MATCH (a:Entity {name_key: $fromKey})
   MATCH (b:Entity {name_key: $toKey})
   MERGE (a)-[r:RELATED_TO {type: $relationType}]->(b)
   ON CREATE SET r.created_at = datetime(), r.valid_at = datetime()`,
  { fromKey: normKey(rel.from), toKey: normKey(rel.to), relationType: rel.relationType }
);
```

`search_entities` — make it case-insensitive so agents stop getting misses that tempt them to re-create entities:

```js
WHERE toLower(e.name) CONTAINS toLower($query) OR toLower(coalesce(e.type,'')) CONTAINS toLower($query)
```

`delete_entities` / `delete_relations` — switch their `{name: $name}` matches to `{name_key: normKey(...)}` for consistency.

**What this doesn't catch**: true aliases ("Postgres" vs "PostgreSQL", "KG" vs "knowledge graph"). Normalization can't solve that; the proper home for fuzzy resolution is CORE's ENTITY vector namespace (0.5-threshold similarity), not this MCP server. Cheap interim: an `aliases` list property on `:Entity` plus a prompt line in the KG cron ("before add_entities, search_entities for the name and reuse the existing node's exact name on a near-match"). Per the main review (Q1 verdict), don't over-invest here until the graph has a consumer.

---

## Q3 — Daily Brief cron: jobs.json entry

Format matches `hermes-stack/data/cron/jobs.json` exactly. Two deployment notes:

1. **Toolset names**: the follow-up request says the container's toolsets are `mcp-openbrain`, `mcp-neo4j_memory`, `mcp-z-brain` — but the live, verified-working jobs (`5c3aa988`, `e4dbe4fd`) whitelist them *unprefixed* (`"openbrain"`, `"neo4j_memory"`, `"z-brain"`). The entry below matches the working jobs. If the runtime has since changed to the `mcp-` prefix, prefix those three — and confirm by comparing against whatever the Memory Systems Health Check job currently has on the VM, since that one demonstrably resolves.
2. **Model**: pinned to `anthropic/claude-sonnet-4`, the documented reliable cron model (Nemotron stalls on OpenRouter cron workloads per ch. 08). The other LLM crons currently show `deepseek/deepseek-v4-pro`; if that's been stable, it works here too — this job is read-heavy, not reasoning-heavy.

```json
{
  "id": "GENERATED_BY_HERMES",
  "name": "Daily Morning Brief",
  "prompt": "<see prompt block below, JSON-escaped>",
  "skills": [],
  "skill": null,
  "model": "anthropic/claude-sonnet-4",
  "provider": "openrouter",
  "base_url": null,
  "script": null,
  "no_agent": false,
  "context_from": null,
  "schedule": { "kind": "cron", "expr": "0 7 * * *", "display": "0 7 * * *" },
  "schedule_display": "0 7 * * *",
  "repeat": { "times": null, "completed": 0 },
  "enabled": true,
  "state": "scheduled",
  "deliver": "origin",
  "origin": {
    "platform": "telegram",
    "chat_id": "7524208683",
    "chat_name": "J S",
    "thread_id": null
  },
  "enabled_toolsets": [
    "terminal",
    "session_search",
    "neo4j_memory",
    "openbrain",
    "z-brain",
    "telegram_push"
  ],
  "workdir": null
}
```

### The prompt (paste into the `prompt` field)

```
DAILY MORNING BRIEF — you are producing the operator's morning brief. This job READS memory; it writes nothing. Your final reply IS the brief — it goes straight to Telegram, so the reply must contain the brief and nothing else: no preamble, no "I will now...", no tool-call narration.

A useful brief changes what the operator does today. Every line must be either actionable or a real status change. If you only have filler, send a short brief — short and dense beats long and padded.

## STEP 1 — GATHER (run all checks; a tool failure is itself a finding, not a reason to stop)

1. PIPELINE FRESHNESS (always first):
   - Use mcp_z-brain_memory_search (any broad query, e.g. "conversation") and find the newest episode timestamp in the results.
   - Compute hours since that timestamp. If > 12 hours, ingestion is STALLED — this becomes the first line of the brief.

2. YESTERDAY'S CAPTURES:
   - mcp_openbrain_recent — thoughts captured in the last 24h. Note count, domains, and the 2-3 most significant items (decisions and discoveries outrank summaries).
   - mcp_openbrain_stats — note any domain whose count changed since yesterday's brief.

3. OPEN LOOPS:
   - session_search across the last 24-36h of conversations (all channels). Hunt specifically for: commitments ("I'll do X", "tomorrow", "later", "next session"), questions the operator raised that never got answered, tasks handed to agents whose completion you cannot confirm, and anything the operator flagged to revisit.
   - mcp_openbrain_search for recent decision-type thoughts (content starting with "[decision]") that mention follow-up work — list any with no evidence of completion.

4. KNOWLEDGE GRAPH DELTA:
   - mcp_neo4j_memory_search_entities for the 2-3 projects/topics most active in yesterday's sessions. Mention the graph ONLY if something changed or contradicts what yesterday's conversations assumed. Silence is fine.

5. SYSTEM PULSE:
   - Each memory tool above doubles as a health probe. For every layer record one of three states: OK / EMPTY (reachable, no recent data) / UNREACHABLE (tool error). Never conflate EMPTY with UNREACHABLE — "I couldn't check" and "there is nothing" are different answers.

## STEP 2 — COMPOSE

Hard limits: max 30 lines, max ~3500 characters (one Telegram message). Plain text with the emoji section headers below — no markdown tables.

Section order (OMIT any empty section entirely — do not write "none"):

⚠️ NEEDS ATTENTION
  Stalled ingestion, unreachable layers, anomalies, anything broken overnight. Most urgent first. If nothing qualifies, omit the section — its absence is the all-clear.

📌 OPEN LOOPS
  Max 5, most consequential first. One line each: the commitment/question, who owes it, and its age in days. Drop anything older than 7 days unless critical — a brief that re-lists the same stale item daily trains you to ignore it.

🧠 YESTERDAY
  Max 4 lines distilling what actually happened: decisions made, problems solved, things shipped. Skip routine cron chatter entirely.

📊 MEMORY PULSE
  Exactly one line, e.g.: "Pulse: last episode 3h ago · 14 thoughts captured · all layers OK" (or name the broken layer).

▶️ FIRST MOVE
  One sentence: the single highest-leverage first action for today, chosen from NEEDS ATTENTION or OPEN LOOPS. Be opinionated — pick one, do not list options.

Style rules:
- Absolute dates and times only ("Jun 9 04:18 UTC", never "yesterday" or "recently").
- Name people, services, and containers explicitly — no pronouns without antecedents, no "the issue".
- Every line self-contained: readable without opening any other tool.

## STEP 3 — DELIVER

- Your reply (the brief) is delivered to Telegram automatically.
- Also send a one-line Pushover summary via terminal:
  ~/.hermes/scripts/pushover-send.sh "☀️ Brief: <N> attention items, <M> open loops"
- Do NOT capture the brief into OpenBrain or write to Neo4j — this job is the system's read habit, and self-referential capture would pollute tomorrow's brief.
```

### Why these design choices

- **Freshness check first, attention section first.** The brief doubles as the memory-freshness alarm (review recommendation #1) until the dedicated cron exists — a stalled pipeline gets noticed at 07:00, not 38 hours later.
- **Omit-empty-sections** + **absent-⚠️-is-the-all-clear**: a brief that prints "no issues" daily becomes wallpaper within a week. Variable structure keeps the signal alive.
- **Open loops capped at 5 with a 7-day expiry** — the failure mode of every auto-generated digest is accumulating a guilt list nobody reads. Expiry forces it to stay a *today* tool.
- **"FIRST MOVE" is the habit hook.** A brief you read is nice; a brief that hands you your first action is one you come back for. This is what converts 3/10 utilization into a daily read.
- **EMPTY vs UNREACHABLE** carries the main review's central theme into the prompt: silent failure must look different from absence.
- **No writes** keeps the job idempotent and keeps the system from narrating itself to itself (the self-referentiality problem from review Q8).

### Rollout

1. Add the entry on the VM (or via Hermes's job-management interface so it generates the `id`), sync back to `hermes-stack/data/cron/jobs.json` locally per the established sync habit.
2. Trigger one manual run and check the output against the limits (length, sections, absolute dates).
3. After 3-4 mornings, tune ruthlessly: cut any section that gets skimmed past. The brief that survives is the one that actually gets read.
