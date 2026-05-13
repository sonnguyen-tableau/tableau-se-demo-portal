# Architecture Overview

## High level

```mermaid
flowchart LR
    User[End User Browser]
    Portal[Next.js Portal]
    Factory[FastAPI Factory Service]
    Tableau[(Tableau Cloud)]
    Anthropic[(Anthropic API)]
    MCP[Tableau MCP Sidecar]
    DB[(Postgres - tenants, audit)]

    User -->|HTTPS| Portal
    Portal -->|TableauViz / TableauPulse| Tableau
    Portal -->|/api/chat SSE| Portal
    Portal -->|mcp_servers HTTP| MCP
    MCP --> Tableau
    Portal -->|Anthropic SDK| Anthropic
    Portal -->|tenants, billing| DB
    Portal -->|POST /factory/start| Factory
    Factory -->|profile, brand, schema| Anthropic
    Factory -->|publish, pulse| Tableau
    Factory -->|jobs, status| DB
```

## Components

| Component | Path | Tech | Role |
| --- | --- | --- | --- |
| Portal | `apps/web/` | Next.js 15, React 19, TS strict | UI shell, embed, chat, factory UI |
| Factory | `services/factory/` | Python 3.12, FastAPI | Pipeline: scrape → profile → generate → publish |
| MCP sidecar | external | `@tableau/mcp-server` in Docker | Exposes Tableau APIs to the agent |
| Tableau Cloud | external | Tableau Cloud (UBL) | Hosts data, workbooks, Pulse |
| Anthropic | external | Claude (Messages API + MCP) | LLM |
| Postgres | `infra/` | Postgres 16 | Tenants, audit log, factory jobs |

## Repository layout

```
apps/
  web/                              # Next.js portal (Phase 1+)
services/
  factory/                          # Python sidecar (Phase 7+)
packages/
  tableau-jwt/                      # JWT minter (Phase 2)
  mcp-tools/                        # MCP tool wrappers + allowlist (Phase 3)
  factory-schema/                   # Shared TS/Python types (Phase 7)
infra/
  docker-compose.yml                # web + factory + tableau-mcp + postgres
docs/
  adr/                              # Architecture decisions
  architecture/                     # Diagrams, this file
  runbooks/                         # Operational runbooks
.claude/                            # Claude project foundation (Phase 0)
.cursor/                            # Cursor rules
```

## Trust boundaries

```mermaid
flowchart TB
    subgraph browser [Browser]
        UI[React UI]
    end
    subgraph portalSrv [Portal Server - Next.js]
        Routes[Route Handlers]
        Auth[NextAuth Session]
        Mint[JWT Minter]
    end
    subgraph factorySrv [Factory - FastAPI]
        Pipeline[Pipeline]
    end
    subgraph mcpBox [MCP Sidecar]
        MCPSrv[tableau-mcp]
    end
    Tableau[(Tableau Cloud)]
    Anthropic[(Anthropic)]

    UI -- session cookie --> Auth
    Routes -- "Zod parse" --> UI
    Routes -- secret in env --> Mint
    Mint -- HS256 JWT --> UI
    UI -- "JWT in token attr" --> Tableau
    Routes -- "service-account token + Tableau-User header" --> MCPSrv
    MCPSrv -- PAT --> Tableau
    Routes -- API key --> Anthropic
    Pipeline -- PAT --> Tableau
    Pipeline -- API key --> Anthropic
```

Key invariants:

- Anthropic API key and Tableau PATs **never leave the server**.
- The JWT minted for the browser contains the end-user identity + tenant — Tableau enforces RLS based on it.
- The MCP sidecar uses a service-account PAT but forwards `Tableau-User` for per-user RLS — the LLM cannot escape RLS by crafting tool args.
- Factory pipeline is server-to-server only; no browser access.

## Data flow: viewing a dashboard

```mermaid
sequenceDiagram
  participant User
  participant Portal as Portal Server
  participant Browser
  participant Tableau
  User->>Browser: GET /t/acme/dashboards/sales
  Browser->>Portal: page request (session cookie)
  Portal->>Portal: NextAuth validates session
  Portal->>Portal: middleware: tenantSlug == session.tenantId
  Portal->>Portal: mint JWT (sub=user, TenantId=acme, scp=views:embed)
  Portal->>Browser: HTML with <TableauViz token=JWT>
  Browser->>Tableau: load view with JWT
  Tableau->>Tableau: validate JWT signature + claims
  Tableau->>Tableau: apply data policy USERATTRIBUTE(TenantId)
  Tableau-->>Browser: rendered viz (only acme rows)
```

## Data flow: AI chat turn

```mermaid
sequenceDiagram
  participant Browser
  participant Portal as Portal Server
  participant Anthropic
  participant MCP as Tableau MCP
  participant Tableau
  Browser->>Portal: POST /api/chat (prompt + viz context)
  Portal->>Portal: validate, derive tenant, build system prompt
  Portal->>MCP: prefetch get-datasource-metadata (Tableau-User: user)
  MCP->>Tableau: REST/Metadata API
  Tableau-->>MCP: fields
  MCP-->>Portal: metadata
  Portal->>Anthropic: messages.stream(mcp_servers=[tableau-mcp])
  loop tool-use turns
    Anthropic->>MCP: query-datasource
    MCP->>Tableau: VDS API (impersonated)
    Tableau-->>MCP: rows
    MCP-->>Anthropic: result
  end
  Anthropic-->>Portal: SSE stream
  Portal-->>Browser: SSE relay
```

## Where to look next

- ADRs: `docs/adr/`
- Setup: `docs/runbooks/`
- Skills (on-demand context for agents): `.claude/skills/`
- Cursor/Claude project conventions: `AGENTS.md`
