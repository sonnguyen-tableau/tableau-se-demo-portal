import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getTenantTheme, setTenantTheme } from "@/lib/tenant-theme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return new NextResponse("Forbidden", { status: 403 });

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId") ?? ctx.tenantId;
  const theme = await getTenantTheme(tenantId);
  return NextResponse.json(theme);
}

const putSchema = z.object({
  tenantId: z.string().min(1).max(120),
  companyName: z.string().min(1).max(120),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  neutralColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontFamily: z.string().max(80),
  logoUrl: z.string().url().max(2048).or(z.literal("")).optional(),
  tone: z.enum(["professional", "playful", "technical"]),
});

export async function PUT(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return new NextResponse("Forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { logoUrl, ...rest } = parsed.data;
  const theme = await setTenantTheme({
    ...rest,
    ...(logoUrl !== undefined ? { logoUrl } : {}),
  });
  return NextResponse.json(theme);
}
