# New Demo Request — per-customer playbook

The repeatable checklist an SE follows for **each** customer demo, once
[`se-quickstart.md`](./se-quickstart.md) is done. It wraps the Claude Code
`new-tenant-portal` skill with the low-friction tooling added for the team.

Two ways to build:

- **A. Enum-driven pipeline (fastest)** — for one of the 7 built-in industries
  with an authored workbook template. Use the Demo Factory UI at `/factory/direct`
  (internal admin). Data + Pulse + brand + tenant record are created for you.
- **B. Scaffolded tenant (most flexible)** — for ANY industry. Scaffold, code the
  generator, publish a self-contained extract, author dashboards. This is how all
  the richest reference tenants were built.

Most real customer demos use **B**.

---

## Path B — scaffolded tenant (step by step)

### 1. Research first (don't skip)

Profile the company (products, brand colors + logo, positioning) and study 3–5
Tableau Public VOTD/Ambassador workbooks in the industry for layout ideas. The
`new-tenant-portal` skill's Phase 0 has the how.

### 2. Scaffold

```bash
cd services/factory
uv run python -m app.scaffold \
    --company "Acme Air Catering" \
    --industry airline-catering \
    --slug acme \
    --tables "Flights,Meals,Complaints"
```

Creates `scripts/acme/` (provision + lib + talk-track) and a **registered**
generator stub at `app/generators/acme.py`. Industry can be any kebab-case slug.

### 3. Flesh out the generator

Edit `app/generators/acme.py` — replace the stub tables with the real schema,
calibrated to the customer's public numbers (±5% jitter). Keep every table
non-empty (Hyper rejects zero-column frames). Verify:

```bash
uv run python -c "from app.generators.acme import generate_acme; \
  print({k: len(v) for k, v in generate_acme().all_tables().items()})"
```

### 4. Publish the datasource to YOUR site

Set your site in `services/factory/.env` (default), then:

```bash
uv run python scripts/acme/provision_acme.py            # build .hyper + .tdsx
uv run python scripts/acme/provision_acme.py --publish  # + publish to Demo/Acme Air Catering
```

This uses the **self-contained extract** path — no Desktop step, no `sqlproxy`
hash needed for the portal dashboards.

> **Per-run different site?** The factory request accepts an optional
> `tableau: {site_url, site_name, pat_name, pat_secret}` that overrides the
> `.env` for that run (`app.config.resolve_tableau`). Useful for a team-shared
> factory; a single-SE deployment can just use `.env`.

### 5. Author dashboards (Claude Code)

Run the `new-tenant-portal` skill (Phase 4) and/or the `tableau-exec-dashboard`
skill. Author self-contained extract-workbooks (one datasource per table,
`skip_connection_check=True` on publish) — the VACS/ACB pattern in
`scripts/vacs/vacs_lib.py`. Author labels in your target **language** (English by
default for this team).

> **Only if you need a live federated `sqlproxy` datasource** (e.g. for the MCP
> agent over a relationship model): publish a `_seed_desktop` workbook from
> Desktop once, then extract the block + hash automatically:
> ```
> uv run python -m app.seed_probe --workbook _seed_desktop --project "Demo/Acme Air Catering" \
>     --out /tmp/acme-seed-block.xml
> ```

### 6. Wire the tenant into the portal

Add the tenant to `apps/web/data/tenants.json` + `tenant-themes.json`, the seed
route `apps/web/app/api/admin/seed/route.ts` (set `allowedProjects: ["Demo/Acme Air Catering"]`),
a demo account in `app/(auth)/sign-in/page.tsx`, and drop a logo in
`apps/web/public/tenants/`. (The factory pipeline can auto-provision the tenant
record + theme via its provision stage if you run through `/factory/direct` with
`FACTORY_PROVISION_SECRET` set.)

### 7. Verify

```bash
# refresh KV + catalog cache so /t/acme shows the dashboards
curl -X POST "http://localhost:3000/api/admin/seed?force=true" -H "cookie: <internal session>"
```

Open `/t/acme`, confirm dashboards render and the AI agent answers. Render checks
and the `allowedProjects` isolation rule are in the `portal-catalog` skill.

---

## Path A — enum-driven pipeline (built-in industries)

For `retail-ecommerce`, `retail-banking`, `retail-mall`, `retail-mediamart`,
`manufacturing`, `healthcare`, `logistics`: open `/factory/direct` (internal
admin), fill company + industry + brand, submit. The pipeline runs
generate → hyper → publish → workbook → pulse → brand → provision against your
`.env` site. Dashboards are auto-authored where a `.twb` template exists.

> The `industry` field now accepts any slug even on this path — but without a
> registered generator the `generate` stage fails with an actionable message
> telling you to scaffold one (Path B).

---

## Checklist

- [ ] Company + design research done
- [ ] Scaffolded (`app.scaffold`) or chose the enum pipeline
- [ ] Generator produces non-empty, calibrated tables
- [ ] Datasource published to `Demo/<Name>` on YOUR site
- [ ] Dashboards authored (self-contained extract) in your target language
- [ ] Tenant wired: tenants.json + themes + seed route `allowedProjects` + logo + demo login
- [ ] `POST /api/admin/seed?force=true` → `/t/<slug>` renders, agent answers
