#!/usr/bin/env bash
#
# Start the Tableau MCP sidecar (@tableau/mcp-server v4) in HTTP mode for local
# dev, so the portal's AI agent gets live Tableau tools.
#
# Docker is NOT required — this runs the official npm package via npx. Reads
# Tableau credentials from apps/web/.env.local (the same file the portal uses).
#
# Usage:   pnpm mcp            (from anywhere in the repo)
#     or:  ./scripts/start-mcp.sh
#
# Leave it running in its own terminal. Stop with Ctrl-C.
#
# Why each flag (all learned the hard way — do not drop them):
#   TRANSPORT=http               portal connects via streamable-HTTP, not stdio
#   PORT=8081                    matches TABLEAU_MCP_URL in .env.local
#   DANGEROUSLY_DISABLE_OAUTH    v4 HTTP mode requires OAuth unless disabled; we
#                                authenticate the sidecar with a PAT instead.
#                                Safe here: binds to localhost only. NEVER use
#                                this for a deployed/shared sidecar.
#   ENABLE_MCP_SITE_SETTINGS=false
#                                v4 calls GET /sites/:id/settings/mcp with a
#                                scoped JWT during tool registration. On sites
#                                without that feature provisioned it throws
#                                -32603 and the agent gets ZERO tools. This flag
#                                skips that call (the built-in escape hatch).
#   SERVER / SITE_NAME / PAT_*   auth, derived from .env.local
#
# The portal must have TABLEAU_MCP_URL="http://localhost:8081/tableau-mcp"
# (note the /tableau-mcp path — v4 serves there, not at root).

set -euo pipefail

# Resolve repo root from this script's location (works from any cwd).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/apps/web/.env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found." >&2
  echo "  Copy apps/web/.env.example -> apps/web/.env.local and fill in your Tableau site + PAT." >&2
  exit 1
fi

# Load .env.local (auto-export every var).
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

# Derive the bare origin (strip the "#/site/<name>" fragment) that v4 wants.
SERVER="$(printf '%s' "${TABLEAU_SITE:-}" | sed -E 's#(https?://[^/#]+).*#\1#')"

# Validate the four required Tableau values are present.
missing=""
[ -n "$SERVER" ] || missing="$missing TABLEAU_SITE"
[ -n "${TABLEAU_SITE_NAME:-}" ] || missing="$missing TABLEAU_SITE_NAME"
[ -n "${TABLEAU_PAT_NAME:-}" ] || missing="$missing TABLEAU_PAT_NAME"
[ -n "${TABLEAU_PAT_SECRET:-}" ] || missing="$missing TABLEAU_PAT_SECRET"
if [ -n "$missing" ]; then
  echo "ERROR: missing required values in .env.local:$missing" >&2
  exit 1
fi

PORT="${MCP_PORT:-8081}"

# v4 config (see header for the why of each).
export TRANSPORT=http
export PORT="$PORT"
export DANGEROUSLY_DISABLE_OAUTH=true
export ENABLE_MCP_SITE_SETTINGS=false
export SERVER
export SITE_NAME="$TABLEAU_SITE_NAME"
export PAT_NAME="$TABLEAU_PAT_NAME"
export PAT_VALUE="$TABLEAU_PAT_SECRET"

echo "Starting Tableau MCP sidecar (v4, HTTP):"
echo "  SERVER    = $SERVER"
echo "  SITE_NAME = $SITE_NAME"
echo "  PAT_NAME  = $PAT_NAME"
echo "  endpoint  = http://localhost:$PORT/tableau-mcp"
echo "  (first run installs @tableau/mcp-server; Ctrl-C to stop)"
echo

exec npx -y @tableau/mcp-server@latest
