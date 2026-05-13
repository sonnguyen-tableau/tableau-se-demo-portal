#!/usr/bin/env bash
# typecheck-on-commit.sh — PreToolUse hook for Bash where the command is
# a `git commit`. Fails the commit if typechecks fail. This is a belt-and-braces
# guard in case local hooks are bypassed; the canonical check lives in CI.

set -uo pipefail

PAYLOAD="$(cat)"

CMD="$(printf '%s' "$PAYLOAD" | python3 -c '
import json, sys
try:
    p = json.load(sys.stdin)
except Exception:
    sys.exit(0)
cmd = None
if isinstance(p, dict):
    cmd = p.get("command") or p.get("input", {}).get("command")
if isinstance(cmd, str):
    print(cmd)
')"

if [[ -z "${CMD:-}" ]]; then
  exit 0
fi

# Only run on `git commit ...`, but not `git commit --amend` (avoid loop on
# pre-commit hook auto-amends).
if [[ "$CMD" != git\ commit* ]]; then
  exit 0
fi
if [[ "$CMD" == *--no-verify* ]]; then
  # User explicitly bypassed; we don't second-guess.
  exit 0
fi

FAILED=0

if [[ -f package.json ]] && command -v pnpm >/dev/null 2>&1; then
  echo "typecheck-on-commit: pnpm typecheck..." 1>&2
  if ! pnpm -s typecheck 1>&2; then
    FAILED=1
  fi
fi

if [[ -f services/factory/pyproject.toml ]] && command -v uv >/dev/null 2>&1; then
  echo "typecheck-on-commit: uv run mypy services/factory..." 1>&2
  if ! (cd services/factory && uv run --quiet mypy app 1>&2); then
    FAILED=1
  fi
fi

if (( FAILED )); then
  {
    echo
    echo "typecheck-on-commit: BLOCKED — typechecks failed."
    echo "Fix the errors above, or re-run with --no-verify if you understand the risk."
  } 1>&2
  exit 1
fi

exit 0
