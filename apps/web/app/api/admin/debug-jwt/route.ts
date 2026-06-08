import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { mintTableauJwt } from "@portal/tableau-jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user) return new NextResponse("no session", { status: 401 });

  const token = await mintTableauJwt(
    {
      clientId: env.TABLEAU_CONNECTED_APP_CLIENT_ID ?? "",
      secretId: env.TABLEAU_CONNECTED_APP_SECRET_ID ?? "",
      secretValue: env.TABLEAU_CONNECTED_APP_SECRET_VALUE ?? "",
    },
    {
      sub: session.user.email ?? "",
      scopes: ["tableau:views:embed"],
      tenantId: session.user.tenantId,
    },
  );

  // Decode payload (no verify) to show what was minted
  const [, payloadB64] = token.split(".");
  const payload = JSON.parse(Buffer.from(payloadB64!, "base64url").toString());

  return NextResponse.json({
    sub: payload.sub,
    iss: payload.iss,
    aud: payload.aud,
    kid: payload.kid,
    scp: payload.scp,
    clientId: env.TABLEAU_CONNECTED_APP_CLIENT_ID,
    secretId: env.TABLEAU_CONNECTED_APP_SECRET_ID,
    siteName: env.TABLEAU_SITE_NAME,
    sessionEmail: session.user.email,
  });
}
