# Z-Brain Memory Architecture Review

**Reviewer**: Claude Fable 5 (claude-fable-5)
**Date**: 2026-06-10
**Inputs**: `docs/shared/brainstorming/fable5-memory-review/zbrain-memory-briefing.md` + read-only workspace exploration (`core-stack/` vendored excerpt, `synth-stack/` full source, `docs/`)

> **Scope caveat**: The local workspace contains only a 3-file excerpt of CORE (`vectorStorage.server.ts`, `model.server.ts`, `llm-provider.server.ts`). Claims about CORE's graph schema, recall fusion, and BullMQ workers that live outside those files are inferred from the briefing and upstream CORE's known design, and are flagged as such. The synth-stack was reviewed in full.

---

## Executive Summary

The architecture is genuinely good for what it is — a single-operator, memory-centric multi-agent system. The three-layer decomposition is defensible, the synth pipeline's queue design is mostly sound, and the "model-agnostic, memory is the center of gravity" philosophy is the right bet. The problems are not in the shape of the system; they are in **three cross-cutting habits**:

1. **Silent failure is the default.** Nearly every error path in the memory code catches, logs, and continues (`vectorStorage.server.ts:93-104`, `worker.js:89-92`, `extractor.js:60-63`). A memory system that fails silently *looks* identical to one that works — until you ask it something it should know. The 38-hour ingestion gap going unnoticed is the predictable symptom, not bad luck. The single highest-value fix in this entire review is a **memory freshness alarm**: one cron that alerts when `now() - last_successful_episode_ingest > N hours`. Everything else is secondary.

2. **The quarantine system is structurally incapable of quarantining.** The extraction prompt *tells the model the threshold* (`prompts.js:31`: "Confidence < 0.6 will be quarantined for human review"). A model that has already decided a memory is worth emitting will not then label it for rejection — you've anchored it to emit ≥0.6. Zero quarantines in 12 events is not evidence of quality; it's evidence the gate is painted on. (Details in Q7.)

3. **Write paths are duplicated; read paths are missing.** The same fact discussed in Telegram and in Zulip lands in two different stores (CORE vs OpenBrain) with different embeddings, different schemas, and no cross-reference. Meanwhile no agent has a single "recall" call that fuses the layers. The system is write-heavy and read-poor — which is exactly the 9/10-infrastructure / 3/10-utilization gap expressed in code.

---

## Part 1: Architecture & Design

### Q1. Is the three-layer architecture (pgvector + Neo4j + OpenBrain) right?

**The decomposition is right; the boundaries are wrong.**

Read charitably, the three layers map to a real cognitive split:

| Layer | Cognitive role |
|---|---|
| pgvector EPISODE namespace | Episodic memory (what happened) |
| Neo4j + STATEMENT namespace | Semantic memory (what is true) |
| OpenBrain | Cross-agent working/curated memory (what we're thinking about) |

That's a legitimate architecture — it's roughly the Zep/Graphiti/MemGPT consensus. **Keep all three roles.** But two boundary problems undermine it:

**Problem A — OpenBrain and CORE's STATEMENT store are the same organ grown twice.** Both are "semantic search over extracted factual text." They differ only in plumbing: different embedding models (`mxbai-embed-large` local vs `gemini-embedding-2-preview` via OpenRouter), different schemas (statements with entity links vs free-text thoughts with a domain tag), different query tools. An agent asking "what did we decide about Traefik?" gets different answers depending on which tool it happens to call, and no tool merges them. This is the overlap to resolve — not by deleting OpenBrain, but by **assigning it a distinct role**: OpenBrain is the *deliberate, agent-curated* store (an agent chose to capture this); CORE statements are the *automatic, pipeline-extracted* store. That distinction is already latent in how they're used. Make it explicit in docs and tool descriptions, and make recall query both.

**Problem B — there is no recall facade.** Each agent must know the topology: which layer, which tool, which threshold. The missing component is a single `recall(query, opts)` MCP tool that fans out to episode search, statement search, graph neighborhood, and OpenBrain search, fuses results (even naive interleaving with provenance tags is fine to start), and returns one ranked list. Until this exists, every "agents don't read memory" complaint (Q4) will persist, because reading memory requires expertise no agent has been given.

**Secondary observations:**

- **Three embedding models across the system** (mxbai local for CORE, gemini-via-OpenRouter for OpenBrain, plus fallback chains that silently switch models). Scores are not comparable across layers, and *a fallback that embeds with a different model than the index was built with produces silent garbage* — a search that returns plausible-looking nothing. If `gemini-embedding-2-preview` is unavailable and OpenBrain falls back to Ollama `gemma4`, every new thought is in a different vector space than the 1,712 existing ones. Embedding fallback chains are a footgun; fail loudly instead, or version the namespace by model.
- **Neo4j earns its keep only if recall actually traverses it.** `vectorStorage.server.ts:518-537` (`batchScoreStatements`, "scoring statements found via graph traversal") suggests CORE does hybrid graph+vector recall — good, keep it. But the *MCP-written* portion of the graph (Zella's cron-mined entities/relations) is write-mostly: nothing in the briefing shows any consumer doing multi-hop queries over it. A graph nobody traverses is an expensive log file. Before investing in the dedup bug and temporal metadata, decide what question the graph answers that vectors can't ("what's connected to X?", "what changed about Y over time?") and build *one* consumer of that question.
- **Error handling in `vectorStorage.server.ts` deserves a pass.** Deletes swallow errors (`:93-104`, `:220-233`) — so graph-store and vector-store can diverge permanently with only a log line. Gets return `null`/empty-Map on failure — so a Redis/Postgres blip reads as "no memories exist." For a memory system, *"I couldn't check" and "there is nothing" must be different answers.*

**Verdict: keep the three roles, merge the two fact stores' read path, add a recall facade, and demote the MCP-written graph until it has a consumer.**

### Q2. Comparison to Anthropic's memory tool (file-based `/memories`)

The Anthropic memory tool primitive is deliberately minimal: a client-side file store (`/memories` directory) the model reads/writes/edits directly, typically checked at conversation start, paired with context editing to keep the window lean. Its virtues are exactly the things Z-Brain's database approach lacks:

| Dimension | File-based (`/memories`) | Z-Brain (DB-backed) |
|---|---|---|
| Legibility | Human can `cat` the entire memory; git-diffable | Opaque; requires dashboards and Cypher |
| Curation | Model *edits* memories — updates, merges, deletes stale facts | Append-mostly; nothing ever gets falsified or merged |
| Retrieval | Whole store loaded or browsed; no search needed at small scale | Semantic search; scales to millions of items |
| Multi-agent | Poor (file locking, no namespacing) | Strong (namespaces, domains, provenance) |
| Failure modes | Almost none | Many, mostly silent (see above) |
| Scale ceiling | Low (tens of KB of hot memory) | Effectively unbounded |

The key insight is that **these are not competing architectures — they're different tiers of the same memory hierarchy.** Anthropic's pattern is a *hot tier*: small, curated, always-in-context, model-maintained. Z-Brain is a *cold tier*: large, searchable, pipeline-maintained. Anthropic's own guidance (memory tool + context editing) is implicitly tiered too — the memory directory is what survives context compaction.

Z-Brain already has accidental hot-tier artifacts: `SOUL.md` (loaded every message), `status.md` (handoff protocol), and the `persona-v2` synthesis briefs. What's missing is closing the loop: **the synthesis output should *be* the hot tier.** Concretely: the 4-hour persona synthesis should write a small, bounded, per-agent context file (a `MEMORY.md` per agent/domain) that Zella, the IDE agents, and Claude Code load at session start — and that the agents can *edit* (correct, prune) with changes flowing back as captures. That gives you Anthropic's curation-and-legibility benefits on top of your scale benefits, instead of choosing between them.

Where Z-Brain genuinely beats the file primitive: cross-agent sharing, provenance, episodic recall over months of history. Where the file primitive beats Z-Brain today: a model can *fix a wrong memory* in one edit. Nothing in Z-Brain falsifies anything (no `invalid_at`, no supersedes, no delete-on-contradiction). That's Q6's subject — and it's the deeper lesson to import from the file-based pattern: memory must be *editable by the agent*, not just appendable.

### Q3. Should the CORE episodic pipeline and the Synthesizer converge?

**Keep the ingestion adapters separate; converge the destination.**

The two pipelines are separated by *source* (conversations vs Zulip/Wiki events), which is fine — different webhooks, polling, normalization, failure domains. Forcing them into one codebase buys nothing.

The real issue is they diverge at the *bottom*, not the top. CORE extraction → entities/statements/episodes in pgvector+Neo4j. Synth extraction → typed thoughts in OpenBrain. So the system's answer to "where do extracted memories live?" is "depends on which door the information walked in through." That's the wrong invariant. A decision is a decision whether it was made in Telegram or Zulip.

Two clean options:

1. **Synth emits into CORE's ingestion queue** (`ingest-episode`) instead of (or in addition to) OpenBrain. Zulip threads and wiki edits become episodes; CORE's extraction handles entity/statement derivation uniformly. Synth keeps its quarantine gate as a pre-filter. This makes CORE the single canonical memory substrate and OpenBrain purely the deliberate-capture scratchpad.
2. **Both pipelines commit typed memories to OpenBrain** and CORE's stores become an implementation detail of CORE's own recall. This is weaker — you lose entity resolution and the graph for Zulip/Wiki content.

Option 1 is the right call. It also fixes a synth-specific smell: today synth's commit flattens provenance into the content string (`openbrain.js:18-29`) and hardcodes a single domain from config (`openbrain.js:39` — `config.openbrain.domain`). **The LLM never chooses a domain — every synth memory lands in the one configured domain.** That alone explains a chunk of the "domain segregation underexercised" gap: it's not underexercised, it's unimplemented in the main write path.

Mechanical issues in the synth worker worth fixing regardless of convergence (`synth-stack/src/queue/worker.js`):

- **The entire batch — including all LLM calls and OpenBrain HTTP calls — runs inside one open Postgres transaction** (`worker.js:27-135`). A slow extraction holds row locks and an open txn for minutes. The `status='processing'` update (`:59-61`) is invisible to outside observers until commit, so it does nothing. Restructure to: claim batch in txn #1 (set `processing`, commit), process outside any transaction, record results per-event in txn #2.
- **OpenBrain commits are not idempotent against rollback** (`worker.js:85-93` + `:136-139`). If the batch transaction rolls back after some events succeeded, those memories are already in OpenBrain, but the `processed_memories` rows and `completed` statuses vanish — retry produces duplicates. Either per-event transactions, or an idempotency key (`source_id + memory hash`) checked before commit.
- **JSON parse failure silently completes the event with zero memories** (`extractor.js:60-63` returns `[]`, worker marks `completed`). A malformed LLM response is a *retryable* failure, not an empty result. This is a silent data-loss path on exactly the events where the model had the most to say (long outputs truncated by `max_tokens: 2000` are the likeliest parse failures).

---

## Part 2: Multi-Agent Memory

### Q4. What's missing for coding agents to meaningfully use memory?

Four things, in priority order:

**1. A recall step in the session-start protocol — made mandatory by the harness, not by hope.** Agents don't query memory because nothing makes them. For Claude Code: a `SessionStart` hook (or a CLAUDE.md directive plus an MCP server entry in `.mcp.json`) that runs `recall(<task summary>)` and injects the top hits. For Antigravity: the same instruction in its rules file. The pattern that works is *push at session start, pull on demand* — inject a small brief automatically, expose `recall` for deliberate follow-up. Relying on the agent to remember to remember is the design that's currently failing. (Note: per your own memory index, z-relay MCP doesn't load in Claude Code sessions — fixing that, or wiring a direct `z-brain`/`openbrain` MCP entry that bypasses z-relay, is the prerequisite for any of this.)

**2. A `decisions` query that's cheap and good.** The killer use case is "what have we already decided about X, and why?" before an architectural choice. Today that requires knowing to search OpenBrain for `[decision]`-prefixed thoughts (a string convention from `openbrain.js:29`). Memory types are flattened into content text — promote `type` to a real field in OpenBrain so `search(type=decision, query=...)` is a first-class call, then teach every coding agent: *before choosing between approaches, query decisions; after choosing, capture one.*

**3. Capture at decision-time, not session-end.** Session summaries are written when context is exhausted and the agent is tired — they're lossy postmortems. The high-value moments are mid-session: a choice made, a bug root-caused, a constraint discovered. A lightweight habit ("when you make a decision the user confirms, capture it immediately with type=decision") beats elaborate end-of-session summarization. The session summary can stay, but as the *episode*, not the *facts*.

**4. The hot-tier brief from Q2.** A per-project `MEMORY.md` distilled by the synthesis loop, loaded by every agent at start. This is what makes Brain #1 (the deep reader) actually share a brain with Brain #2 (Zella) — they read the same brief, so a decision made in Telegram constrains a refactor made in the IDE.

What I'd explicitly *not* build: per-agent memory silos, elaborate agent-to-agent messaging through memory, or automatic injection of large search results into coding contexts (context pollution makes agents worse, not better — the brief must stay small, ~1-2K tokens).

### Q5. Hermes native `memory` tool vs MCP memory tools

**Unify on the MCP tools as the canonical read/write path; keep the native tool only if it's the automatic-injection mechanism, and document that.**

The current state — native tool in chat, `skip_memory=True` in cron, MCP tools whitelisted per-cron-job — means Zella has *different memory behavior depending on how she was invoked*. That's the worst property a memory system can have: the agent's knowledge depends on the entry point. The `enabled_toolsets` whitelist (`mcp-{name}` naming) makes this worse by making memory access an easy thing to silently forget when authoring a cron job — tools registered but invisible.

Decision rule: figure out what the native `memory` tool does that the OpenBrain MCP tools don't. Two cases:

- **If it's just a bridge to the same OpenBrain endpoints** (as the briefing suggests — "OpenBrain MCP bridge"), it's pure duplication. Disable it everywhere, use the MCP tools in chat and cron alike, and delete `skip_memory` special-casing. One code path, one behavior, one thing to debug.
- **If it does automatic recall injection** (pre-loading relevant memories into context before the model runs, rather than waiting for a tool call), it's not a tool, it's middleware — and it's valuable. Keep it, rename the concept ("memory injection"), and make it work in cron too: cron jobs *especially* benefit from automatic context since there's no human to prompt recall.

Either way, the end state has one property: **every Zella invocation — Telegram, API, cron — sees the same memory through the same interface.** The `skip_memory=True` flag is a workaround that became architecture; retire it deliberately.

A default worth adding for cron: include `mcp-openbrain` (and `mcp-neo4j_memory` where relevant) in every cron job's toolset unless explicitly opted out. Whitelists default-closed are right for dangerous tools; memory is the one toolset that should be default-open.

---

## Part 3: Memory Quality & Configuration

### Q6. Temporal validity on the knowledge graph

**Worth doing, in the lightweight form. Skip full bitemporal.**

Recommended shape (Graphiti-style, simplified):

- On every relation: `created_at` (when recorded), `valid_at` (when the fact became true, default = created_at), `invalid_at` (nullable — when it stopped being true), and optionally `invalidated_by` (UUID of the superseding relation or episode).
- **Invalidation instead of deletion.** When `add_relations` writes a relation that contradicts an existing one — same subject, same type, different object, for *functional* relations (a person has one employer, a service has one current version) — set `invalid_at` on the old edge rather than deleting or duplicating. Non-functional relations (KNOWS, RELATES_TO) just accumulate.
- Recall default: `WHERE r.invalid_at IS NULL` (current facts), with an opt-in `as_of` parameter for history.

That's three properties and one write-time rule. The expensive part of temporal graphs — contradiction *detection* via LLM, bitemporal correction semantics, time-travel queries — you don't need. The cheap part — never again confusing "was true in May" with "is true now" — you badly need: the graph is mined from conversations by a cron job, which means stale facts are *systematically* re-extracted and re-asserted forever unless something can mark them dead.

Two things to check before building (I could not verify in the vendored excerpt — only 3 CORE files are in the local workspace):

1. **Upstream CORE statements may already carry temporal fields.** CORE's statement model (the RedPlanetHQ lineage) is built around fact validity; if `validAt`/`invalidAt` already exist on statements, the right move is to *use the existing mechanism* and apply this work only to the MCP `add_relations` path, which appears to bypass CORE's extraction entirely.
2. **The duplicate-relations bug is probably an entity-resolution bug, not an upsert bug.** A MERGE on relation geometry can't produce duplicates *unless the endpoints differ* — i.e., the same real-world entity exists as 2-3 distinct nodes, and each copy gets its own (correctly upserted) relation. That would explain why fixing the MERGE didn't stop the duplicates, and why they come "per related entity." Before another round of MERGE surgery, run: `MATCH (n) WITH toLower(n.name) AS k, collect(n) AS nodes WHERE size(nodes) > 1 RETURN k, size(nodes)` — if that returns rows, the fix belongs in entity dedup (the ENTITY namespace's 0.5 similarity threshold and exact-name matching), and the relation "duplicates" are a symptom. The cron cleanup job is treating the symptom on a schedule.

### Q7. Is the confidence/quarantine system well-calibrated?

**No — and it can't be, as built.** Three structural problems:

1. **The threshold is disclosed to the model** (`prompts.js:31`: "Confidence < 0.6 will be quarantined for human review"). This converts confidence from an estimate into a *decision*: the model has already chosen to emit the memory, so it reports a number that makes the memory count. Zero quarantines in 12 events is the expected output of this design. Remove that line from the prompt entirely — the model should never know what happens at any score.

2. **Self-reported confidence in the same completion is decoration.** LLMs are systematically overconfident and cluster scores at 0.8-0.95 regardless of content. If you want a real signal, options in increasing cost: (a) rubric-anchored scores — define in the prompt what 0.3, 0.6, 0.9 *mean* ("0.3 = plausibly useful but generic; 0.9 = specific, durable, would change a future decision") with few-shot examples that include low scores; (b) a second cheap judge pass scoring the extraction against the source ("is this faithful? is it durable? is it self-contained?"); (c) skip scores for gating and gate on *type* instead — `snippet`/`command` are nearly always safe to auto-commit, `summary` is where the noise lives.

3. **There's no calibration loop, so no threshold can be "right."** A calibrated system means: sample N committed memories monthly, label them keep/noise, plot precision against reported confidence, and move the threshold to where precision crosses your tolerance. With 12 events there's no data; with the threshold-disclosure bug there never will be. Fix the prompt first, accumulate ~100 extractions, then look.

Prompt improvements beyond confidence (all cheap):

- **Require self-contained memories**: "name all entities explicitly; no pronouns; no 'we' or 'the team' — say who" — extracted text is retrieved months later without its source context.
- **Anchor dates**: "convert relative time ('yesterday', 'last week') to absolute dates using the event timestamp" — the event payload should pass the timestamp in.
- **Cap extractions per event** (e.g., max 3): selectivity pressure beats confidence scores at filtering filler.
- **Let the model pick the domain** from `list_domains` output instead of the config-hardcoded one (see Q3).
- **Raise `max_tokens`** or instruct brevity per-memory — 2000 tokens with multi-memory JSON arrays is where truncated-JSON parse failures (the silent data-loss path from Q3) will come from.

Also: build the quarantine *review surface* before tuning anything. A quarantine queue nobody looks at is a `/dev/null` with extra steps — currently there's no workflow to review, approve, or reject, so even a perfectly calibrated gate would just accumulate.

### Q8. What does healthy utilization look like?

The 9/10-infrastructure / 3/10-utilization gap has a precise signature in this system: **every pipeline writes memory; almost nothing reads it.** The honest utilization metric isn't query counts — it's *"how many agent outputs this week were materially changed by a memory recall?"* Track reads-with-consequences, not stored thoughts (1,712 thoughts is an inventory stat, not a utilization stat).

**The daily heartbeat of a well-utilized system looks like:**

- **Morning (cron)**: Zella produces a daily brief that *consumes* memory — yesterday's captures, open decisions awaiting follow-up, anything in quarantine, memory-freshness status (last ingest age, queue depths). Delivered to Telegram. This is the keystone habit: it makes memory *read* daily, it surfaces staleness within 24h instead of 38h+, and it gives every other capture a reason to exist (it might surface tomorrow).
- **During work**: every coding session starts with a recall (Q4) and produces 1-3 decision/snippet captures at decision-time. Zella conversations flow through the episodic pipeline automatically (once the ingestion gap is fixed).
- **Evening/4-hourly**: synthesis runs, updating the hot-tier briefs (Q2).
- **Weekly (15 min, human)**: review quarantine, spot-check 5 committed memories for quality, prune one stale hot-tier fact. This is the calibration loop from Q7 and the only place a human is required.

**Tier 1 use cases to build, in order:**

1. **The daily brief** (above). Highest leverage, exercises every layer, creates the read habit, doubles as monitoring. Build this first.
2. **Recall-before-decide in coding agents** (Q4 items 1-2). This is the "Three Brains spine" actually functioning: Brain #1 consulting Brain #3 before acting.
3. **The frontier-chat import** (already on your roadmap). The system is self-referential partly because it's *empty of non-self content* — months of ChatGPT/Claude/Gemini history is the fastest way to make recall return interesting answers about your actual life and work, which is what makes querying it habit-forming.
4. **One non-engineering domain used for real** — project tracking for a real project, reading notes, whatever you'll actually consult. Domain segregation stays theoretical until a second domain has a reader.

What I'd *stop* doing until the above exist: expanding the graph cron, adding interface polish (you already deferred this — correct), and adding new memory types. Utilization is a demand-side problem; all current investment is supply-side.

---

## Top 10 Recommendations (priority order)

| # | Action | Effort | Addresses |
|---|---|---|---|
| 1 | Memory-freshness alarm (alert when last episode ingest > 6h old; include queue depths) | Hours | 38h gap class of failures |
| 2 | Remove threshold disclosure from extraction prompt; add rubric-anchored confidence + per-event extraction cap | Hours | Q7 |
| 3 | Build the daily brief cron (reads all layers, posts to Telegram) | Days | Q8, utilization |
| 4 | Fix synth worker transaction scope + idempotent OpenBrain commits + retry on parse failure | Day | Q3, silent data loss |
| 5 | Single `recall` facade tool fusing episodes/statements/graph/OpenBrain | Days | Q1, Q4 |
| 6 | Session-start recall hook + decision-time capture convention for coding agents (fix z-relay loading first) | Days | Q4 |
| 7 | Check entity-node duplication as root cause of relation duplicates before more MERGE fixes | Hours | Q6, dedup bug |
| 8 | `valid_at`/`invalid_at` + invalidation-on-contradiction in the `add_relations` path (after checking upstream CORE statement schema) | Days | Q6 |
| 9 | Unify Hermes memory access: retire `skip_memory` special-casing, default memory toolsets on in cron | Day | Q5 |
| 10 | Route synth output into CORE ingestion (or at minimum: structured provenance fields + LLM-chosen domain) | Days | Q3 |

Not ranked but load-bearing: make "couldn't check" distinct from "nothing found" throughout `vectorStorage.server.ts`, and remove cross-model embedding fallbacks (fail loudly instead).
