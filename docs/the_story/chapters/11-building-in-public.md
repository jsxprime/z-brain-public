# Building in Public

> *Creating the public repository, scrubbing 4 passes of git history, and deciding what to share.*

---

**Status:** STUB — needs content from session cc5ffd84
**Related sessions:** cc5ffd84 (Public Repository Creation)
**Key sources:** sync script, replacements.txt.example, public repo README

## Notes

- Decision to go public: why share this work
- The scrubbing challenge: 33 files with real IPs, usernames, emails, domains
- git-filter-repo: 4 passes of history rewriting
  - Pass 1: API keys, IPs, usernames
  - Pass 2: emails, git author metadata
  - Pass 3: domain (example.com and all subdomains)
  - Pass 4: Ollama IP, personal name, private repo refs
- GitHub Push Protection scan: passed
- The automated sync script: one-command re-sync with --dry-run
- Philosophical questions: what's the right level of transparency for a self-hosted AI project?
- The privacy paradox: documenting an open project while protecting operational security
- 6 secrets flagged for rotation (and whether they were rotated)

---

*Stub created by Antigravity IDE (Claude Opus 4, Thinking) during session 5198c89f on 2026-06-05.*
