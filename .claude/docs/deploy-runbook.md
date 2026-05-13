# Deploy Runbook (placeholder)

Auto-injected when a prompt mentions `deploy`, `release`, or `production`. Filled in during Phase 11.

## Current state

The project is in early phases. There is no production deploy yet. **Do not deploy production code at this stage.**

## When deploys are introduced

This document will cover:

1. Branch / tag conventions and release cadence.
2. Pre-deploy checklist (CI green, security review clean, schema migrations dry-run).
3. Tableau Cloud changes that must accompany each release (Connected App allowlist updates, new data policies, Pulse metric versions).
4. Rollback procedure per surface (portal, factory, Tableau artifacts).
5. Smoke tests post-deploy.
6. Incident-ladder contact + paging policy.
7. Secret rotation runbook (Connected App secret, service-account PAT, Anthropic key).

## Until then

If asked to deploy: stop and ask a human. The hooks will not block this since "deploy" isn't a tool call, but agents should consult this document first.
