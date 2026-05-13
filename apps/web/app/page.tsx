import Link from "next/link";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Tableau AI Portal</h1>
        {session?.user ? (
          <span className="text-sm text-[hsl(var(--muted-foreground))]">
            Signed in as <strong>{session.user.email}</strong>
            <span className="ml-2 rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs">
              {session.user.tenantName}
            </span>
          </span>
        ) : (
          <Link
            href="/sign-in"
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white"
          >
            Sign in
          </Link>
        )}
      </header>

      <section className="space-y-4 text-lg leading-relaxed">
        <p>
          Multi-tenant embedded analytics on Tableau Cloud with a Claude-powered Self-Service
          Analytics agent. Phase 1 scaffold: NextAuth, multi-tenant routing, and middleware
          guardrails are in place. Embedded Tableau views arrive in Phase 2.
        </p>
        <p className="text-base text-[hsl(var(--muted-foreground))]">
          See <code>docs/architecture/overview.md</code> for the system view and{" "}
          <code>AGENTS.md</code> for engineering conventions.
        </p>
      </section>

      {session?.user ? (
        <nav className="mt-10 flex flex-wrap gap-3">
          <Link
            href={`/t/${session.user.tenantId}`}
            className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm hover:bg-[hsl(var(--muted))]"
          >
            Open my tenant workspace
          </Link>
          <Link
            href="/api/health"
            className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm hover:bg-[hsl(var(--muted))]"
          >
            Health check
          </Link>
        </nav>
      ) : null}
    </main>
  );
}
