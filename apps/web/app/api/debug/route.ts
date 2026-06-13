/**
 * GET /api/debug — internal-only diagnostic endpoint.
 * Returns JWT config, tenant records, and env var status.
 * DELETE this file after debugging.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getTenant, listTenants } from "@/lib/tenants";
import { getTenantTheme } from "@/lib/tenant-theme";
import { env } from "@/lib/env";
import { join } from "path";
import { readFile } from "fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return new NextResponse("forbidden", { status: 403 });

  // 1. Env vars
  const envStatus = {
    TABLEAU_CONNECTED_APP_CLIENT_ID: env.TABLEAU_CONNECTED_APP_CLIENT_ID?.slice(0, 8) + "...",
    TABLEAU_CONNECTED_APP_SECRET_ID: env.TABLEAU_CONNECTED_APP_SECRET_ID?.slice(0, 8) + "...",
    TABLEAU_CONNECTED_APP_SECRET_VALUE: env.TABLEAU_CONNECTED_APP_SECRET_VALUE ? "SET" : "MISSING",
    TABLEAU_SITE_NAME: env.TABLEAU_SITE_NAME,
    TABLEAU_EMBED_USER: env.TABLEAU_EMBED_USER ?? "NOT SET",
    TABLEAU_ODA: env.TABLEAU_ODA,
    KV_REST_API_URL: process.env.KV_REST_API_URL ? "SET" : "NOT SET",
    PORTAL_ENV: env.PORTAL_ENV,
  };

  // 2. File system check
  const cwd = process.cwd();
  let fileData: Record<string, unknown> = {};
  try {
    const raw = await readFile(join(cwd, "data", "tenants.json"), "utf-8");
    fileData = { tenantsJson: JSON.parse(raw), cwd };
  } catch (e) {
    fileData = { error: String(e), cwd };
  }

  // 3. Tenant records via lib (KV or file)
  const tenants = await listTenants();
  const sfBank = await getTenant("salesforce-bank");
  const vincom = await getTenant("vincomretail");
  const sfTheme = await getTenantTheme("salesforce-bank");
  const vincomTheme = await getTenantTheme("vincomretail");

  return NextResponse.json({
    envStatus,
    fileData,
    tenants,
    detail: {
      salesforceBank: { tenant: sfBank, theme: sfTheme },
      vincomretail: { tenant: vincom, theme: vincomTheme },
    },
  });
}
