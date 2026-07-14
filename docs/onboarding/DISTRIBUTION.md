# Distribution — publishing this repo to the SE team

This repo is a **clean, secret-free clone** prepared for team sharing. Git history
contains no `.env` files, PATs, Connected App secrets, or Anthropic keys (verified:
none were ever committed). A normal push is safe.

> The maintainer's live secrets live only in gitignored files on their own
> machine (`apps/web/.env.local`, `services/factory/.env`,
> `.claude/settings.local.json`). Those are NOT in this clone and will not travel
> via git. If you ever distribute a *copy of a working directory* (zip, rsync)
> instead of a git clone/push, scrub and rotate those first.

## Recommended: create a team-org repo, then mark it a template

```bash
# 1. Create an empty repo in the team org (via gh, or the GitHub UI):
gh repo create <team-org>/tableau-se-demo-portal --private \
    --description "Tableau SE Demo Factory — multi-tenant embedded analytics + AI agent"

# 2. Point this clone at it and push (main + the working branch):
cd tableau-se-demo-portal
git remote add origin https://github.com/<team-org>/tableau-se-demo-portal.git
git push -u origin HEAD          # push the current branch
# optionally also publish main:
# git push origin main

# 3. In the GitHub UI: Settings → check "Template repository".
#    Each SE then clicks "Use this template" for their own isolated copy.

# 4. Grant the SE team read access (Settings → Collaborators & teams).
```

**Why a template repo (not shared collaborators):** each SE gets an independent
copy, so their tenants, `data/*.json`, and any accidental local commits never
touch anyone else's environment. Improvements flow back via PRs to this repo,
which SEs can pull into their copies.

## What each SE does next

Point them at **[`se-quickstart.md`](./se-quickstart.md)** — clone (or "Use this
template"), configure their own Tableau Cloud site + Connected App + PAT +
Anthropic key, `pnpm dev`, then build demos with the `new-tenant-portal` Claude
Code skill.

## Reference tenants shipped

The 10 reference tenants (Nam A Bank, VACS, VNPT, Singapore Airlines, ACB, SHB,
Mey Group, Vincom, MediaMart, Salesforce Bank) ship as **worked examples** — their
`services/factory/scripts/<tenant>/` folders and `apps/web/data/*.json` entries
are the richest teaching material. They were built against the maintainer's site,
so their dashboards won't render on a new SE's site until rebuilt; that's expected.
