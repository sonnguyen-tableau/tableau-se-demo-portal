import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getTenant, setDefaultTenant } from "@/lib/tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const { slug } = await context.params;
  const tenant = await getTenant(slug);
  if (!tenant) return new NextResponse("not found", { status: 404 });

  await setDefaultTenant(slug);
  return NextResponse.json({ ok: true, default: slug });
}
