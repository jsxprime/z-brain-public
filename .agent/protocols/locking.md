# Workspace Locking Protocol

**Status:** Active  
**Version:** 1.0  
**Scope:** `z-brain` workspace (Antigravity IDE, Zella/Hermes, Claude Code, OpenAI Codex)

---

## 1. The Problem
Multiple AI agents operate simultaneously within this workspace. Antigravity runs locally on the Mac, while Zella, Claude Code, and Codex run via Docker/SSH on the VM host (`YOUR_VM_IP`). Without coordination, agents may overwrite files, cause git merge conflicts, or crash during simultaneous destructive operations.

## 2. The Master Lockfile
To solve this, we use a single, unified master lockfile located on the VM host.

**Location on VM Host:** `~/docker/hermes-stack/data/.agent-lock.json`  
**Location inside Zella's Container:** `/opt/data/.agent-lock.json`

Because the file lives on the VM, Zella can read it instantly via her local CLI, Claude Code can read it when executing on the host, and Antigravity can read/write it remotely via SSH.

## 3. Protocol Rules

1. **Check Before Destructive Action:** Before executing `git commit`, `git push`, writing new code, running an `npm install`, or executing a large test suite, agents MUST read the lockfile.
2. **Respect the Lock:** If the file exists, has `"locked": true`, and the `expires_at` timestamp is in the future, the agent MUST pause execution or notify the user that the workspace is currently locked by another agent.
3. **Acquire the Lock:** When an agent begins a complex plan, it MUST write to the lockfile claiming the lock.
4. **Auto-Expiration (Safety):** All locks MUST have an `expires_at` timestamp set no more than 30 minutes in the future. If an agent crashes and fails to release the lock, other agents may safely ignore the lockfile if the current UTC time is past `expires_at`.
5. **Release the Lock:** Upon task completion, the agent MUST overwrite the file with `"locked": false` or delete the file entirely.

## 4. Lockfile Format

The lockfile must be valid JSON:

```json
{
  "locked": true,
  "agent": "Antigravity",
  "task": "Refactoring authentication module",
  "locked_at": "2026-05-25T21:15:00Z",
  "expires_at": "2026-05-25T21:45:00Z"
}
```
