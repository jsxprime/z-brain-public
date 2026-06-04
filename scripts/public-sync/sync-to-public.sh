#!/usr/bin/env bash
#
# sync-to-public.sh — Sync private z-brain repo to the public sanitized copy
#
# Usage:
#   ./scripts/public-sync/sync-to-public.sh          # Full sync (clone, scrub, push)
#   ./scripts/public-sync/sync-to-public.sh --dry-run # Scrub but don't push (inspect first)
#
# Prerequisites:
#   - git-filter-repo (brew install git-filter-repo)
#   - Git push access to the public repo
#   - The replacements file at scripts/public-sync/replacements.txt (gitignored)
#   - The mailmap file at scripts/public-sync/mailmap.txt (gitignored)
#
# What it does:
#   1. Clones the private repo to a temp directory (full copy, no shared objects)
#   2. Runs git-filter-repo to replace all secrets, IPs, emails, names, and domains
#   3. Rewrites commit author/committer metadata via mailmap
#   4. Verifies no known secrets remain in history
#   5. Force-pushes to the public repo
#   6. Cleans up the temp directory
#

set -euo pipefail

# --- Configuration ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PUBLIC_REPO="https://github.com/jsxprime/z-brain-public.git"
REPLACEMENTS_FILE="$SCRIPT_DIR/replacements.txt"
MAILMAP_FILE="$SCRIPT_DIR/mailmap.txt"
WORK_DIR="/tmp/z-brain-public-sync-$$"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "🔍 DRY RUN — will scrub but not push"
fi

# --- Preflight checks ---
echo "🔎 Preflight checks..."

if ! command -v git-filter-repo &>/dev/null; then
  echo "❌ git-filter-repo not found. Install with: brew install git-filter-repo"
  exit 1
fi

if [[ ! -f "$REPLACEMENTS_FILE" ]]; then
  echo "❌ Replacements file not found at: $REPLACEMENTS_FILE"
  echo ""
  echo "   Create it from the template:"
  echo "   cp $SCRIPT_DIR/replacements.txt.example $REPLACEMENTS_FILE"
  echo "   Then fill in your actual secret values."
  exit 1
fi

if [[ ! -f "$MAILMAP_FILE" ]]; then
  echo "❌ Mailmap file not found at: $MAILMAP_FILE"
  echo ""
  echo "   Create it from the template:"
  echo "   cp $SCRIPT_DIR/mailmap.txt.example $MAILMAP_FILE"
  echo "   Then fill in your actual name/email."
  exit 1
fi

echo "  ✅ git-filter-repo found"
echo "  ✅ replacements.txt found ($(wc -l < "$REPLACEMENTS_FILE" | tr -d ' ') rules)"
echo "  ✅ mailmap.txt found"
echo ""

# --- Step 1: Clone ---
echo "📦 Step 1: Cloning private repo to temp directory..."
git clone --no-local "$REPO_ROOT" "$WORK_DIR" 2>/dev/null
echo "  ✅ Cloned to $WORK_DIR"
echo ""

# --- Step 2: Scrub ---
echo "🧹 Step 2: Scrubbing secrets from history..."
cd "$WORK_DIR"
git filter-repo \
  --replace-text "$REPLACEMENTS_FILE" \
  --replace-message "$REPLACEMENTS_FILE" \
  --mailmap "$MAILMAP_FILE" \
  --force 2>/dev/null
echo "  ✅ History rewritten ($(git rev-list --count HEAD) commits)"
echo ""

# --- Step 3: Verify ---
echo "🔍 Step 3: Verifying no secrets remain..."

# Read literal (non-regex) patterns from replacements file as verification targets
VERIFY_PATTERNS=""
while IFS='==>' read -r left right; do
  # Skip regex lines and empty lines
  [[ "$left" =~ ^regex: ]] && continue
  [[ -z "$left" ]] && continue
  # Skip short/generic patterns that would false-positive
  [[ ${#left} -lt 8 ]] && continue
  VERIFY_PATTERNS+="${left}|"
done < "$REPLACEMENTS_FILE"

# Remove trailing pipe
VERIFY_PATTERNS="${VERIFY_PATTERNS%|}"

if [[ -n "$VERIFY_PATTERNS" ]]; then
  FOUND=$(git log --all -p | grep -oE "$VERIFY_PATTERNS" | sort -u || true)
  if [[ -n "$FOUND" ]]; then
    echo "  ❌ SECRETS FOUND IN HISTORY — aborting push!"
    echo "$FOUND" | sed 's/^/     /'
    echo ""
    echo "  The scrubbed repo is at: $WORK_DIR"
    echo "  Investigate and update replacements.txt before retrying."
    exit 1
  fi
fi
echo "  ✅ Zero secrets found in history"
echo ""

# --- Step 4: Push ---
if [[ "$DRY_RUN" == true ]]; then
  echo "🔍 DRY RUN — skipping push. Scrubbed repo is at:"
  echo "   $WORK_DIR"
  echo ""
  echo "   Inspect with: cd $WORK_DIR && git log --oneline -5"
  echo "   Push manually: git remote add origin $PUBLIC_REPO && git push --force origin main"
  exit 0
fi

echo "🚀 Step 4: Pushing to public repo..."
git remote add origin "$PUBLIC_REPO"
git push --force origin main 2>&1 | grep -v '^remote:'
echo "  ✅ Pushed to $PUBLIC_REPO"
echo ""

# --- Step 5: Cleanup ---
echo "🧹 Step 5: Cleaning up..."
rm -rf "$WORK_DIR"
echo "  ✅ Temp directory removed"
echo ""

echo "✅ Done! Public repo is up to date."
echo "   → $PUBLIC_REPO"
