import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { enforceImpressionBudget, ImpressionBudgetExceededError } from "@/lib/billing";
import { audit } from "@/lib/audit";
import { mintTableauJwt, JWT_TTL_SECONDS } from "@portal/tableau-jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLEAU_SCOPES = [
  "tableau:views:embed",
  "tableau:views:embed_authoring",
  "tableau:insights:embed",
] as const;

const requestSchema = z.object({
  scopes: z
    .array(z.enum(TABLEAU_SCOPES))
    .min(1, "at least one scope required")
    .max(TABLEAU_SCOPES.length),
});

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "no_tenant" }, { status: 403 });
  }

  let status;
  try {
    status = await enforceImpressionBudget(tenantId);
  } catch (e) {
    if (e instanceof ImpressionBudgetExceededError) {
      audit.emit({
        kind: "jwt.budget_blocked",
        userId: session.user.email,
        tenantId,
        impressionsUsed: e.status.used,
        impressionsCap: e.status.cap,
      });
      return NextResponse.json(
        { error: "impression_budget_exceeded", status: e.status },
        { status: 429 },
      );
    }
    throw e;
  }

  audit.emit({
    kind: "jwt.mint",
    userId: session.user.email,
    tenantId,
    scopes: parsed.data.scopes,
    impressionsUsed: status.used,
    impressionsCap: status.cap,
  });

  const token = await mintTableauJwt(
    {
      clientId: env.TABLEAU_CONNECTED_APP_CLIENT_ID,
      secretId: env.TABLEAU_CONNECTED_APP_SECRET_ID,
      secretValue: env.TABLEAU_CONNECTED_APP_SECRET_VALUE,
    },
    {
      sub: session.user.email,
      scopes: parsed.data.scopes,
      tenantId,
      ...(session.user.region ? { region: session.user.region } : {}),
      ...(session.user.groups && session.user.groups.length > 0
        ? { groups: session.user.groups }
        : {}),
    },
  );

  return NextResponse.json(
    {
      token,
      expiresIn: JWT_TTL_SECONDS,
      tenantId,
      impressionStatus: status,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
