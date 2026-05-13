#!/usr/bin/env bash
# session-start.sh — SessionStart hook. Prints a one-screen status banner
# with the most relevant project context. Stdout is injected into the
# agent's session as supplementary context.

set -uo pipefail

SITE="${TABLEAU_SITE:-(unset)}"
ENV_PROFILE="${PORTAL_ENV:-dev}"

INDUSTRIES=""
if [[ -d services/factory/templates ]]; then
  INDUSTRIES="$(ls services/factory/templates/*.twb 2>/dev/null | xargs -n1 basename 2>/dev/null | sed 's/\.twb$//' | tr '\n' ',' | sed 's/,$//')"
fi
INDUSTRIES="${INDUSTRIES:-(none scaffolded yet)}"

MCP_STATUS="not running"
if command -v curl >/dev/null 2>&1; then
  if curl -fsS -m 1 "${TABLEAU_MCP_URL:-http://localhost:8081/health}" >/dev/null 2>&1; then
    MCP_STATUS="up"
  fi
fi

GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '(no git)')"
GIT_DIRTY=""
if git diff --quiet 2>/dev/null && git diff --cached --quiet 2>/dev/null; then
  GIT_DIRTY="clean"
else
  GIT_DIRTY="dirty"
fi

cat <<EOF
tableau-ai-portal — session start
─────────────────────────────────
Tableau site:    ${SITE}
Env profile:     ${ENV_PROFILE}
MCP sidecar:     ${MCP_STATUS}
Industries:      ${INDUSTRIES}
Git branch:      ${GIT_BRANCH} (${GIT_DIRTY})

Quick docs:      AGENTS.md
Skill library:   .claude/skills/
Subagents:       .claude/agents/
Architecture:    docs/architecture/ (added in later phases)
EOF
exit 0
