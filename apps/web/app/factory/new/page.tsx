import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { tenantFromSession } from "@/lib/tenant";

interface PageProps {
  searchParams: Promise<{ url?: string; error?: string }>;
}

export default async function FactoryNewPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) redirect("/sign-in");
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-xl font-semibold">Internal-only</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          The Demo Factory is only available to internal users while it&apos;s in early access.
        </p>
      </main>
    );
  }

  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header>
        <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Demo Factory
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">New tenant from URL</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Paste a customer&apos;s website URL. The pipeline scrapes the site, profiles the
          business with Claude, generates 2 years of realistic sample data, publishes it to
          Tableau Cloud, builds Pulse metrics, and provisions a branded tenant portal.
        </p>
      </header>

      {error ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <form action="/api/factory/start" method="POST" className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Customer URL</span>
          <input
            type="url"
            name="url"
            required
            placeholder="https://example.com"
            className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 outline-none focus:border-brand"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tenant slug (optional)</span>
          <input
            type="text"
            name="tenant_slug"
            pattern="[a-z0-9-]{2,48}"
            placeholder="acme-bikes"
            className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 outline-none focus:border-brand"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Start factory
        </button>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Factory sidecar: <code>{env.FACTORY_URL ?? "(not configured)"}</code>
        </p>
      </form>
    </main>
  );
}
