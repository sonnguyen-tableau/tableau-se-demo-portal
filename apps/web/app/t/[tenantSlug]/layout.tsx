import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessTenant, tenantFromSession } from "@/lib/tenant";
import { getTenantTheme, themeToCssVariables } from "@/lib/tenant-theme";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ tenantSlug: string }>;
}

export default async function TenantLayout({ children, params }: LayoutProps) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const { tenantSlug } = await params;
  const ctx = tenantFromSession(session);
  if (!canAccessTenant(ctx, tenantSlug)) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-xl font-semibold">Tenant mismatch</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          You don&apos;t have access to <code>{tenantSlug}</code>.
        </p>
      </main>
    );
  }

  const rawTheme = await getTenantTheme(ctx?.tenantId ?? tenantSlug);
  const theme = {
    primary: rawTheme.primaryColor,
    logoUrl: rawTheme.logoUrl,
    cssText: themeToCssVariables(rawTheme),
  } as const;

  return (
    <div
      className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 py-6"
      style={{ ...(themeToInlineStyle(theme.cssText)) }}
    >
      <header className="mb-6 flex items-center justify-between border-b border-[hsl(var(--border))] pb-4">
        <div className="flex items-center gap-3">
          {theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={theme.logoUrl}
              alt={ctx?.tenantName ?? tenantSlug}
              className="h-8 w-8 rounded object-contain"
            />
          ) : (
            <div
              aria-hidden
              className="h-8 w-8 rounded"
              style={{ background: theme.primary }}
            />
          )}
          <div>
            <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Tenant
            </p>
            <h1 className="text-xl font-semibold tracking-tight">
              {ctx?.tenantName ?? tenantSlug}
            </h1>
          </div>
        </div>
        <span className="text-sm text-[hsl(var(--muted-foreground))]">
          {session.user.email}
        </span>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function themeToInlineStyle(cssText: string): Record<string, string> {
  // Convert "--key: value; --key2: value2;" into a React-friendly object.
  return Object.fromEntries(
    cssText
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [k, ...rest] = d.split(":");
        return [(k ?? "").trim(), rest.join(":").trim()] as const;
      })
      .filter(([k]) => k.startsWith("--")),
  );
}
