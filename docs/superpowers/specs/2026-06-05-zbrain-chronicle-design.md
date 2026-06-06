# The Z-Brain Chronicle — Design Spec

**Date:** 2026-06-05
**Session:** 5198c89f
**Status:** DRAFT — awaiting user review

---

## Goal

Create a **living documentation system** that captures the full Z-Brain journey — the decisions, failures, breakthroughs, and perspectives — in a form that can eventually become blog posts, a website, and part of the public GitHub repository.

The system has two halves:
1. **The content** — structured documents in `docs/the_story/`
2. **The capture process** — a skill + workflow integration that systematically interviews the user and updates the docs

---

## Design Principles

1. **Capture first, polish later.** Write raw and honest. Don't lose material trying to make it pretty.
2. **Write naturally in the private repo.** Use real IPs, names, references. The public sync script (`scripts/public-sync/sync-to-public.sh`) handles scrubbing automatically.
3. **Multiple audiences, layered depth.** Builders get technical guides. The AI community gets thought leadership. Non-technical founders get the "Meta-Product Owner" playbook. Each reader enters at the layer that serves them.
4. **Three voices.** the operator's perspective (the architect-founder), Zella's perspective (the always-on agent), and the IDE agents' perspective (the deep-work sessions). This is unprecedented — no other project has documented an AI agent's first-person account of its own architecture.
5. **Living document.** Content grows with the project. Every session can add fragments. Periodic interviews add depth.
6. **Cross-referenced.** Link to source files, configs, conversation transcripts, specs, and external references. The story is grounded in evidence.

---

## Part 1: Content Structure

### File Layout

```
docs/the_story/
├── README.md                           # Master index + reading guide
│
├── chapters/                           # Layer 1: The Narrative Spine (chronological)
│   ├── 00-preface.md                   # What this project is, why it exists
│   ├── 01-the-vision.md                # Why build this? The problem of AI amnesia.
│   ├── 02-foundation.md                # Choosing the stack: Postgres, MCP, Hermes
│   ├── 03-the-amnesia-incident.md      # Blown API credits, the 24-hour migration
│   ├── 04-building-the-nervous-system.md # CORE pipeline, OpenBrain, Redis queues
│   ├── 05-giving-zella-a-body.md       # Telegram, SOUL.md, personality & identity
│   ├── 06-teaching-zella-where-she-lives.md # Execution context, Docker socket abuse
│   ├── 07-the-ecosystem.md             # Zulip, Wiki.js, Synthesizer — the organism grows
│   ├── 08-the-gateway-boot-paradox.md  # MCP tools in cron, enabled_toolsets whitelist
│   ├── 09-cross-model-critique.md      # Using Claude to review Gemini, and vice versa
│   ├── 10-three-brains.md              # Chris Lema mapping, Nate B. Jones, "Open Brain"
│   ├── 11-building-in-public.md        # Public repo, scrubbing pipeline, open source
│   ├── 12-hermes-desktop.md            # Remote access, native GUI, multi-Mac deployment
│   └── ...                             # Chapters added as the project evolves
│
├── reference/                          # Layer 2: Technical Reference (architectural)
│   ├── architecture-overview.md        # System diagram, container inventory, data flows
│   ├── memory-pipeline.md              # CORE: Postgres + pgvector + Neo4j + Redis + BullMQ
│   ├── hermes-agent.md                 # Gateway, platforms, config, provider chain
│   ├── soul-md.md                      # What SOUL.md is, how it shapes Zella's behavior
│   ├── mcp-integration.md              # MCP servers, tool discovery, cron toolset gotcha
│   ├── ecosystem-services.md           # Zulip, Wiki.js, Synthesizer, Dashboard
│   ├── cron-system.md                  # Job definitions, model pinning, skip_memory
│   ├── monitoring-ops.md               # Docker/FS monitors, health checks, Pushover
│   ├── provider-routing.md             # OpenRouter, fallback chains, model reliability
│   ├── deployment-guide.md             # How to reproduce this setup (public-facing)
│   └── decision-log.md                 # Key architectural decisions with rationale
│
├── perspectives/                       # Layer 3: The Voices
│   ├── jays-perspective.md             # The Meta-Product Owner's account
│   ├── zellas-account.md               # First-person from the always-on agent
│   ├── ide-agents-view.md              # Cross-model collaboration, debugging sessions
│   └── agentic-collaboration.md        # The workflow model: voice → agent → code
│
├── assets/                             # Visual material
│   ├── diagrams/                       # Mermaid source files + rendered PNGs
│   │   ├── system-architecture.mmd
│   │   ├── memory-pipeline-flow.mmd
│   │   ├── content-cascade.mmd
│   │   └── session-timeline.mmd
│   └── images/                         # Generated hero images, concept art
│
└── appendices/                         # Reference material
    ├── timeline.md                     # Chronological event log with dates
    ├── session-index.md                # Index of all dev sessions with summaries
    ├── glossary.md                     # Terms: SOUL.md, MCP, CORE, OpenBrain, etc.
    ├── external-references.md          # Links to articles, repos, tools that influenced
    └── interview-archive/              # Raw interview transcripts (date-stamped)
        └── 2026-06-05-initial.md
```

### Layer 1: Narrative Chapters

Each chapter follows a loose template:

```markdown
# Chapter Title

> *One-line hook that captures the drama or insight*

## The Situation
What was happening. What problem we were trying to solve.

## What We Did
The technical narrative. Decisions, implementation, debugging.
Include code snippets, config examples, terminal output where they tell the story.

## What Went Wrong (if applicable)
Failures, dead ends, surprises. The honest part.

## What We Learned
The insight. The pattern. What a reader can take away.

## Zella's Take
[Optional] A short first-person section from Zella's perspective on the event.

## References
Links to source files, specs, conversation transcripts, external articles.
```

### Layer 2: Technical Reference

Each reference doc follows:

```markdown
# Component Name

## What It Does
One paragraph summary.

## Architecture
Diagram (Mermaid) + explanation.

## How It Works
Technical deep dive with config examples and code references.

## Key Decisions
Why this approach was chosen. What alternatives were considered.

## Known Issues & Gotchas
Hard-won operational knowledge.

## External References
Links to upstream docs, related projects, influential articles.
```

### Layer 3: Perspectives

These are the most unique documents. No template — they're written in voice.

- **the operator's Perspective**: The "Meta-Product Owner" experience. Directing agents, managing context, the voice-to-agent workflow, the human cost and reward.
- **Zella's Account**: Captured via API interview. Her experience of the architecture — what she can and can't do, how she perceives the tools, the sessions, the upgrades.
- **IDE Agents' View**: The cross-model critique workflow. What it's like when Claude reviews Gemini's plan. The complementary strengths.

---

## Part 2: The Story Capture Skill

### Skill: `story-capture`

A new skill at `~/.gemini/config/skills/story-capture/SKILL.md` that formalizes the interview-and-update workflow.

### Triggers

The skill is invoked in three modes:

#### Mode 1: Session Fragments (during work)
At natural breakpoints — after a major fix, a design decision, or a significant discovery — the agent pauses to capture 1-2 quick observations or questions.

**Not a formal interview.** More like a journalist's notebook:
- "You chose X over Y — why?"
- "What were you worried about here?"
- "How does this connect to the bigger picture?"
- "What would you tell someone trying to do this themselves?"

Fragments are collected in a scratch file (`scratch/story-fragments-YYYY-MM-DD.md`) during the session.

#### Mode 2: Session Teardown (end of session)
Integrated into `z-cortex-session-sync` teardown workflow as a new step between "Update Status Snapshot" and "Capture Final Thought":

1. Review fragments collected during the session
2. Review what was accomplished (from status.md update)
3. Draft updates to relevant chapter(s) and/or reference doc(s)
4. If a new chapter topic emerged, create a stub with raw notes
5. Update `appendices/timeline.md` with session events
6. Commit changes to git

#### Mode 3: Deep Interview (periodic)
Every 3-5 sessions, or when something significant happens, a structured 5-10 minute conversation:

1. Review what's happened since the last deep interview
2. Ask open-ended questions about motivations, concerns, vision
3. Explore connections between recent work and the bigger picture
4. Capture the operator's emotional/philosophical state (this is the stuff that makes the best content)
5. Save raw transcript to `appendices/interview-archive/`
6. Process into chapter and perspective updates

### Interview Question Bank

The skill includes a rotating bank of questions organized by category:

**Motivation & Vision**
- What's driving you to work on this right now?
- Has your vision for Z-Brain changed since you started?
- What would "done" look like?

**Decision Archaeology**
- Walk me through the decision to [X]. What did you consider?
- If you could go back and change one architectural decision, what would it be?
- What's the thing you're most proud of technically?

**The Human Experience**
- What's the hardest part of directing AI agents?
- When was the last time an agent surprised you — good or bad?
- What does your non-AI-developer friends think about what you're building?

**Forward Looking**
- What's the next thing that scares you about this project?
- If someone else wanted to build their own Z-Brain, what's the first thing you'd tell them?
- Where do you see Zella in 6 months?

**Zella-Specific** (asked to Zella via API)
- How do you experience the difference between a Telegram conversation and an API session?
- What's the most useful tool in your toolkit? What's missing?
- If you could change one thing about your architecture, what would it be?

> [!IMPORTANT]
> **Model/Provider Documentation (Zella):** Every Zella interview MUST record the active model and provider at time of interview. Check via:
> ```bash
> ssh YOUR_VM_USER@YOUR_VM_IP 'docker exec hermes-agent /opt/hermes/.venv/bin/python3 -c "
> import yaml
> with open(\"/opt/data/config.yaml\") as f:
>     cfg = yaml.safe_load(f)
> model = cfg.get(\"model\", {})
> print(\"Model:\", model.get(\"default\", \"unknown\"))
> print(\"Provider:\", model.get(\"provider\", \"unknown\"))
> "'
> ```
> Record as: `**Model/Provider:** \`model-name\` via provider-name` in interview metadata.

> [!IMPORTANT]
> **Model/Provider Documentation (IDE Agent):** Every document produced for the Chronicle MUST note the IDE agent's model in the authorship line. Format: `*Drafted by [Agent Name] ([Model Name]) during session [ID] on [date].*` Example: `*Drafted by Antigravity IDE (Claude Opus 4, Thinking) during session 5198c89f on 2026-06-05.*`

---

## Part 3: Integration with z-cortex-session-sync

### Updated Teardown Workflow

```
## 🌙 Teardown Workflow (End of Session)

1. **Vectorize Documentation** — run `node ingest-docs.js`
2. **Update Status Snapshot** — update status.md
3. **Story Capture** — invoke story-capture skill in teardown mode:     ← NEW
   a. Review session fragments (if any)
   b. Draft updates to relevant story documents
   c. Update timeline
   d. Commit story changes
4. **Capture Final Thought** — OpenBrain capture
```

### Updated Startup Workflow

```
## 🌅 Startup Workflow (Beginning of Session)

1-5. (existing steps)
6. **Story Context** — check `docs/the_story/README.md` for current    ← NEW
   state of documentation. Note any chapters in progress or
   flagged for next interview.
```

---

## Part 4: Visual Strategy

### Diagrams (Mermaid)

Mermaid diagrams render natively on GitHub and in most markdown viewers. Use for:
- System architecture (container topology)
- Data flow (memory pipeline, event processing)
- Decision trees (provider fallback chain)
- Timeline (project phases)

### Generated Images

Use the `generate_image` tool for:
- Chapter hero images (concept art for each major narrative beat)
- Infographic-style summaries of complex systems
- Social media / blog post header images

### Charts

For quantitative data (container counts over time, memory growth, session counts):
- Mermaid `xychart-beta` for simple charts
- ASCII tables for data that changes frequently

---

## Part 5: External References

The story references external sources that influenced the architecture and philosophy:

| Source | What It Influenced |
|---|---|
| [Chris Lema — "Your AI Has Three Brains"](https://chrislema.com) | The three-layer composable architecture mapping |
| [Nate B. Jones — "Open Brain"](https://natebjones.com) | Direct inspiration for the memory-first architecture |
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | The agent runtime |
| [Model Context Protocol](https://modelcontextprotocol.io) | The tool/data integration standard |
| [pgvector](https://github.com/pgvector/pgvector) | Vector storage for semantic memory |
| [OpenRouter](https://openrouter.ai) | Multi-provider model routing |

---

## Part 6: Public Repo Considerations

Content in `docs/the_story/` will be synced to `jsxprime/z-brain-public` via the existing sync script. Key points:

1. **Write naturally** — use real IPs, names, references. The script scrubs them.
2. **No secrets in prose** — API keys or tokens should never appear in narrative text (they shouldn't be there anyway).
3. **Relative links preferred** — link to files within the repo using relative paths so links survive the sync.
4. **Assets must be committed** — generated images go in `docs/the_story/assets/images/` and must be git-tracked.
5. **The scrubbed version is the public story** — "the operator" becomes "the operator", IPs become placeholders. This is fine for the narrative and adds to the privacy-respecting ethos of the project.

---

## Verification Plan

### Content Quality
- Each chapter reviewed by the spec-document-reviewer subagent for clarity and completeness
- the operator reviews and approves before commit
- Zella's sections reviewed for authenticity (ask her to verify)

### Technical Accuracy
- All code snippets tested or verified against actual system state
- All architecture diagrams match current container inventory
- All external links checked for validity

### Public Repo Safety
- Run `sync-to-public.sh --dry-run` after adding story content
- Verify scrubbing works correctly on narrative text
- Ensure no new secrets were inadvertently included

---

## Immediate Next Steps

1. Create the directory structure
2. Write `README.md` (master index)
3. Draft `appendices/timeline.md` from status.md session history
4. Draft `reference/architecture-overview.md` with current system diagram
5. Draft `chapters/00-preface.md` — the "what and why" entry point
6. Create the `story-capture` skill
7. Interview Zella for her initial perspective
8. Update `z-cortex-session-sync` with story integration

---

## Open Questions — RESOLVED

1. ~~**Chapter scope:**~~ **RESOLVED** — No forced word count. We are in capture mode. Raw content dictates format and details. Derivatives (blog posts, articles) will be designed later from the raw material.
2. ~~**Interview cadence:**~~ **RESOLVED** — Event-triggered. Deep interviews happen after milestones, significant decisions, or breakthroughs — not on a fixed schedule.
3. ~~**Zella's voice:**~~ **DEFERRED** — Will figure out model pinning later. Use whatever she's running at the time for now.
