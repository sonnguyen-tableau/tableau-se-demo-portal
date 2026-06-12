import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { setTenantTheme } from "@/lib/tenant-theme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const themeSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  neutralColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fontFamily: z.string().min(1).max(80).optional(),
  logoUrl: z.string().url().max(1024).optional(),
  tone: z.enum(["professional", "playful", "technical"]).optional(),
});

export async function PUT(
  req: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!session?.user || !ctx?.isInternal) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const { slug } = await context.params;

  const body = await req.json().catch(() => ({}));
  const parsed = themeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  const d = parsed.data;
  const next = await setTenantTheme({
    tenantId: slug,
    ...(d.primaryColor !== undefined ? { primaryColor: d.primaryColor } : {}),
    ...(d.secondaryColor !== undefined ? { secondaryColor: d.secondaryColor } : {}),
    ...(d.neutralColor !== undefined ? { neutralColor: d.neutralColor } : {}),
    ...(d.fontFamily !== undefined ? { fontFamily: d.fontFamily } : {}),
    ...(d.logoUrl !== undefined ? { logoUrl: d.logoUrl } : {}),
    ...(d.tone !== undefined ? { tone: d.tone } : {}),
  });
  return NextResponse.json(next);
}
