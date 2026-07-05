import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { DEFAULT_THEME, deleteTenantTheme, getTenantTheme, setTenantTheme } from "@/lib/tenant-theme";

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
  sidebarTextColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fontFamily: z.string().max(80),
  logoUrl: z.string().url().max(2048).or(z.literal("")).optional(),
  logoLayout: z.enum(["icon", "wordmark"]).optional(),
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

  const { logoUrl, logoLayout, sidebarTextColor, ...rest } = parsed.data;
  const theme = await setTenantTheme({
    ...rest,
    ...(logoUrl !== undefined ? { logoUrl } : {}),
    ...(logoLayout !== undefined ? { logoLayout } : {}),
    ...(sidebarTextColor !== undefined ? { sidebarTextColor } : {}),
  });
  return NextResponse.json(theme);
}

export async function DELETE(req: Request): Promise<Response> {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) return new NextResponse("Forbidden", { status: 403 });

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId") ?? ctx.tenantId;
  await deleteTenantTheme(tenantId);
  return NextResponse.json({ tenantId, ...DEFAULT_THEME });
}
