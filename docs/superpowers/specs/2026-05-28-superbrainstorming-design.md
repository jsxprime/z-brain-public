# Superbrainstorming Skill Design

## Overview
A drop-in replacement for the default `brainstorming` skill that replaces the local subagent review loop with a cross-model critique using local CLI installations of Claude Code and Codex.

## Goals
- Maintain the rapid, interactive drafting phase between the user and Antigravity.
- Leverage the reasoning capabilities of Claude (Opus) and Codex for rigorous architectural review before implementation.
- Execute these reviews entirely locally via CLI, bypassing network/VM overhead.

## Process Flow

1. **Exploration & Drafting (Unchanged)**
   - Context exploration.
   - Clarifying questions.
   - Proposing 2-3 approaches.
   - Presenting design sections for approval.

2. **Documentation (Unchanged)**
   - Write the validated design to `specs/YYYY-MM-DD-<topic>-design.md`.

3. **Cross-Model Critique (New)**
   - Instead of dispatching a local subagent, the skill prompts the user to select a reviewer model (Claude or Codex).
   - Antigravity uses the `run_command` tool to execute the appropriate CLI in non-interactive mode.
   - *Claude Command:* `claude -p "I am a fellow AI agent. We drafted a spec at <spec_path>. Act as a Staff Engineer. Provide a rigorous critique, pointing out edge cases, flaws, or simpler alternatives."`
   - *Codex Command:* `<codex-cli-command> -p "..."` (Exact command/binary to be configured).

4. **Review & Revise (New)**
   - Antigravity captures the raw terminal output from the CLI and presents it to the user.
   - User and Antigravity discuss the feedback and update the spec if necessary.

5. **Handoff (Unchanged)**
   - Transition to `writing-plans` skill.
