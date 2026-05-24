import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { recordView } from "@/lib/view-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  workbookSlug: z.string().min(1),
  viewSlug: z.string().min(1),
  workbookName: z.string().min(1),
  viewName: z.string().min(1),
  projectName: z.string().default(""),
});

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad Request", { status: 400 });

  await recordView(session.user.email, parsed.data);
  return NextResponse.json({ ok: true });
}
