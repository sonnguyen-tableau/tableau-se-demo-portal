/**
 * POST /api/admin/tenants/sync
 *
 * Reconcile the tenant registry against the current SE's Tableau site(s):
 * archive tenants whose Demo/<Name> folder no longer exists, reactivate ones
 * whose folder has reappeared. See lib/tenant-sync.ts for the rules + safety
 * guard.
 *
 * Query:
 *   ?apply=true  → persist status changes. Omitted/false → dry-run preview only.
 *
 * Internal-admin only. Returns the full SyncPlan either way so the UI can show
 * a preview before the SE commits.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { planTenantSync } from "@/lib/tenant-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const apply = new URL(req.url).searchParams.get("apply") === "true";

  try {
    const plan = await planTenantSync({ apply });
    return NextResponse.json(plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
