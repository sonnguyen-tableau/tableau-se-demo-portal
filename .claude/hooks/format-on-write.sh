#!/usr/bin/env bash
# format-on-write.sh — PostToolUse hook for Edit|Write|MultiEdit|StrReplace.
# Formats the changed file based on extension. Non-blocking: failures log a
# warning but do not fail the tool call.

set -uo pipefail

PAYLOAD="$(cat)"

FILE_PATH="$(printf '%s' "$PAYLOAD" | python3 -c '
import json, sys
try:
    p = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for k in ("file_path", "path", "filePath", "target_path"):
    v = p.get(k) if isinstance(p, dict) else None
    if isinstance(v, str):
        print(v)
        sys.exit(0)
')"

if [[ -z "${FILE_PATH:-}" || ! -f "$FILE_PATH" ]]; then
  exit 0
fi

case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.md|*.mdx|*.css|*.html|*.yml|*.yaml)
    if command -v pnpm >/dev/null 2>&1 && [[ -f package.json ]]; then
      pnpm exec prettier --write --log-level warn "$FILE_PATH" >/dev/null 2>&1 || \
        echo "format-on-write: prettier skipped for $FILE_PATH" 1>&2
    elif command -v npx >/dev/null 2>&1; then
      npx --no-install prettier --write --log-level warn "$FILE_PATH" >/dev/null 2>&1 || true
    fi
    ;;
  *.py)
    if command -v uv >/dev/null 2>&1 && [[ -f services/factory/pyproject.toml ]]; then
      (cd services/factory && uv run --quiet ruff format "$FILE_PATH" 2>/dev/null) || \
        echo "format-on-write: ruff skipped for $FILE_PATH" 1>&2
    elif command -v ruff >/dev/null 2>&1; then
      ruff format "$FILE_PATH" >/dev/null 2>&1 || true
    fi
    ;;
  *.sh)
    if command -v shfmt >/dev/null 2>&1; then
      shfmt -w "$FILE_PATH" >/dev/null 2>&1 || true
    fi
    ;;
esac

exit 0
