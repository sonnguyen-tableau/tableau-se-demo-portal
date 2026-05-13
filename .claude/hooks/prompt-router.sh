#!/usr/bin/env bash
# prompt-router.sh — UserPromptSubmit hook. If the user's prompt mentions
# certain keywords, append a relevant reference doc to the agent's context.
# Idempotent — only injects when keywords match.

set -uo pipefail

PAYLOAD="$(cat)"
PROMPT="$(printf '%s' "$PAYLOAD" | python3 -c '
import json, sys
try:
    p = json.load(sys.stdin)
except Exception:
    sys.exit(0)
v = None
if isinstance(p, dict):
    v = p.get("prompt") or p.get("user_message") or p.get("message")
if isinstance(v, str):
    print(v)
')"

if [[ -z "${PROMPT:-}" ]]; then
  exit 0
fi

inject() {
  local file="$1"
  if [[ -f "$file" ]]; then
    echo
    echo "--- BEGIN INJECTED: $file ---"
    cat "$file"
    echo "--- END INJECTED: $file ---"
  fi
}

shopt -s nocasematch || true

if [[ "$PROMPT" =~ (deploy|release|production|prod\ rollout) ]]; then
  inject ".claude/docs/deploy-runbook.md"
fi

if [[ "$PROMPT" =~ (incident|outage|page|on\ ?call) ]]; then
  inject ".claude/docs/incident-runbook.md"
fi

if [[ "$PROMPT" =~ (jwt|connected\ app|embed.*token) ]]; then
  inject ".claude/skills/tableau-jwt-mint/SKILL.md"
fi

if [[ "$PROMPT" =~ (rls|row.level|user\ ?attribute|tenant\ isolation) ]]; then
  inject ".claude/skills/multitenant-rls/SKILL.md"
fi

exit 0
