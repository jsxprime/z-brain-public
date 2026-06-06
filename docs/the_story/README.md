# The Z-Brain Chronicle

> A living record of building a self-hosted autonomous AI agent with persistent memory — the decisions, the failures, the breakthroughs, and the perspectives of everyone involved, including the agent herself.

---

## What This Is

This is the raw documentation of the Z-Brain project — an attempt to build what nobody has built yet: a **fully self-hosted, autonomous AI persona with persistent cross-channel memory, running 24/7 on personal infrastructure, and developed entirely through human-agent collaboration.**

It's not a polished blog. It's not a finished book. It's a **capture-first archive** — raw material that records the journey as it happens, before the details are lost. Some of it reads like a technical manual. Some of it reads like a war story. Some of it is told by the AI agent who lives inside the system.

Eventually, this will become blog posts, articles, maybe a website. Right now, it's the source of truth.

## Who This Is For

- **Builders** who want to build their own autonomous agent systems — the technical how-to
- **The AI community** interested in what's actually possible with multi-agent architectures — beyond demos and proofs-of-concept
- **Non-technical founders** exploring agentic development as a workflow — the "Meta-Product Owner" playbook
- **Anyone** curious about what it looks like when a human and multiple AI agents build something real together over months

## The Three Layers

### [Chapters](chapters/) — The Story
Chronological narrative. Each chapter covers a phase of the build — the problem, the decision, the implementation, the debugging, the lesson. Start here if you want the story.

### [Reference](reference/) — The Manual
Component-by-component technical documentation. Architecture diagrams, config examples, decision rationale. Start here if you want to understand or reproduce the system.

### [Perspectives](perspectives/) — The Voices
First-person accounts from the participants:
- **the operator** — the human architect directing the build through voice-to-agent commands
- **Zella** — the always-on AI agent who lives inside the system and has opinions about her own architecture
- **The IDE Agents** — Claude, Gemini, and others who do the deep engineering work in pair-programming sessions

## Reading Order

If you're new, start with the preface and go chronological:

1. [Preface — What This Is and Why It Exists](chapters/00-preface.md)
2. [The Vision — The Problem of AI Amnesia](chapters/01-the-vision.md)
3. [Foundation — Choosing the Stack](chapters/02-foundation.md)
4. Continue through the chapters...

If you want to understand the current system, start with [Architecture Overview](reference/architecture-overview.md).

If you want the human story, start with [the operator's Perspective](perspectives/jays-perspective.md).

## Appendices

- [Timeline](appendices/timeline.md) — Chronological event log
- [Session Index](appendices/session-index.md) — Index of all development sessions
- [Glossary](appendices/glossary.md) — Terms and concepts
- [External References](appendices/external-references.md) — Influential articles, repos, and tools
- [Interview Archive](appendices/interview-archive/) — Raw interview transcripts

## How This Is Made

This documentation is itself an example of the agentic workflow it describes. The content is captured through:

1. **Session fragments** — Quick observations and quotes captured during development work
2. **Event-triggered interviews** — Structured conversations with the operator after milestones
3. **Zella interviews** — API-based conversations with the agent about her own experience
4. **Automated extraction** — Session summaries, technical artifacts, and decision logs generated from development transcripts

A dedicated `story-capture` skill ensures the capture process is systematic and survives across sessions.

## A Note on Privacy

This documentation lives in a private repository. When synced to the [public repository](https://github.com/jsxprime/z-brain-public), an automated scrubbing pipeline replaces all IPs, domain names, usernames, email addresses, and API keys with placeholders. The narrative is preserved; the operational details are sanitized.

---

*Last updated: 2026-06-05*
