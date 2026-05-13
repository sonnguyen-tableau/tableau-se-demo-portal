import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessTenant, tenantFromSession } from "@/lib/tenant";

/**
 * Tenant URL enforcement. Every `/t/[slug]/...` request must satisfy
 * `slug === session.tenantId` (or the user is internal).
 *
 * Public surfaces (`/`, `/sign-in`, `/api/auth/...`, `/api/health`) bypass.
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (
    pathname === "/" ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets")
  ) {
    return NextResponse.next();
  }

  const session = await auth();

  if (!session) {
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("next", pathname);
    return NextResponse.redirect(signIn);
  }

  if (pathname.startsWith("/t/")) {
    const slug = pathname.split("/")[2] ?? "";
    const ctx = tenantFromSession(session);
    if (!canAccessTenant(ctx, slug)) {
      return new NextResponse("Forbidden: tenant mismatch", { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
