#!/usr/bin/env bash
# secret-scan.sh — PreToolUse hook for Edit|Write.
# Blocks any write whose payload contains likely secrets.
#
# Hook contract: receives JSON on stdin describing the tool invocation.
# Exit 0 => allow. Exit non-zero (with stderr message) => block.

set -euo pipefail

PAYLOAD="$(cat)"

# Extract the file content the tool is about to write. We check several
# possible payload shapes (Edit, Write, MultiEdit, StrReplace) for the
# `new_string` / `contents` fields.
EXTRACTED="$(printf '%s' "$PAYLOAD" | python3 -c '
import json, sys
try:
    p = json.load(sys.stdin)
except Exception:
    print("", end="")
    sys.exit(0)
chunks = []
def walk(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in ("contents", "new_string", "content", "file_text"):
                if isinstance(v, str):
                    chunks.append(v)
            walk(v)
    elif isinstance(o, list):
        for x in o: walk(x)
walk(p)
print("\n".join(chunks))
')"

if [[ -z "$EXTRACTED" ]]; then
  exit 0
fi

# Patterns to block. Keep narrow to avoid false positives on docs.
PATTERNS=(
  'sk-ant-[A-Za-z0-9_-]{20,}'
  'sk-[A-Za-z0-9]{32,}'
  'AKIA[0-9A-Z]{16}'
  'AIza[0-9A-Za-z_-]{30,}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  '-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----'
  'tableau_pat_[A-Za-z0-9]{20,}'
  '"secret_value"[[:space:]]*:[[:space:]]*"[A-Za-z0-9+/=]{16,}"'
  '"client_secret"[[:space:]]*:[[:space:]]*"[A-Za-z0-9_.-]{20,}"'
  'TABLEAU_CONNECTED_APP_SECRET_VALUE[[:space:]]*=[[:space:]]*[A-Za-z0-9+/=]{16,}'
)

HITS=()
for re in "${PATTERNS[@]}"; do
  if printf '%s' "$EXTRACTED" | grep -E -q -- "$re"; then
    HITS+=("$re")
  fi
done

if (( ${#HITS[@]} > 0 )); then
  {
    echo "secret-scan: BLOCKED — possible secret detected in write payload."
    echo "Matched patterns:"
    for p in "${HITS[@]}"; do
      echo "  - $p"
    done
    echo
    echo "If this is a false positive, refactor to load from env or .claude/settings.local.json."
    echo "If you need to commit a placeholder, use obvious dummies like '<your-secret-here>' or 'redacted'."
  } 1>&2
  exit 1
fi

exit 0
