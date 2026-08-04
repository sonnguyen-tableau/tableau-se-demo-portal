import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { env } from "@/lib/env";
import { getT } from "@/lib/i18n";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { listDevTenantLogins } from "@/lib/dev-logins";

interface PageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const session = await auth();
  const { next, error } = await searchParams;
  if (session?.user) redirect(next && next.startsWith("/") ? next : "/");
  const { locale, t } = await getT();
  // Demo-account chips are derived from the ACTIVE tenant registry (one
  // <slug>@demo.com login each, password "dev") — so the list stays in sync with
  // tenant archive/reactivate and only shows logins that actually work. Empty
  // outside dev.
  const demoLogins = await listDevTenantLogins();

  return (
    <div className="flex min-h-dvh">
      {/* ── Left — visual panel ───────────────────────────────────────── */}
      <div className="relative hidden w-[45%] flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{ background: "linear-gradient(150deg, #0f2642 0%, #0c1f38 50%, #071526 100%)" }}
      >
        {/* Subtle grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
          aria-hidden="true"
        />
        {/* Glow orbs */}
        <div className="pointer-events-none absolute -left-16 top-1/4 h-64 w-64 rounded-full bg-sf-blue-60/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute right-0 bottom-1/3 h-80 w-56 rounded-full bg-sf-blue-40/10 blur-3xl" aria-hidden="true" />

        {/* Logo mark */}
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sf-blue-60 shadow-elev-2">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-body-sm font-bold text-white">Tableau AI Portal</span>
              <span className="text-meta font-medium uppercase tracking-[0.18em] text-sf-blue-40">Analytics Platform</span>
            </div>
          </div>
          <LanguageToggle locale={locale} variant="light" />
        </div>

        {/* Hero copy */}
        <div className="relative max-w-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-meta font-semibold uppercase tracking-widest text-sf-blue-40 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-sf-blue-40 animate-pulse" aria-hidden="true" />
            {t("signIn.badge")}
          </div>
          <h2 className="text-display font-extrabold leading-[1.08] tracking-tight text-white">
            {t("signIn.heroLine1")}
            <br />
            <span className="bg-gradient-to-r from-sf-blue-40 via-cyan-300 to-sf-blue-20 bg-clip-text text-transparent">
              {t("signIn.heroLine2")}
            </span>
          </h2>
          <p className="mt-5 text-body leading-relaxed text-white/60">
            {t("signIn.heroSubtitle")}
          </p>

          {/* Feature pills */}
          <div className="mt-8 flex flex-wrap gap-2">
            {["Tableau Embedding", "Claude AI Agent", "Multi-tenant RLS", "Demo Factory"].map((f) => (
              <span
                key={f}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-meta text-white/50"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        <p className="relative text-meta text-white/25">© {new Date().getFullYear()} Tableau AI Portal</p>
      </div>

      {/* ── Right — form panel ────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-8 py-12">
        {/* Mobile logo */}
        <div className="mb-10 flex items-center gap-2.5 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sf-blue-70 shadow-elev-1">
            <svg className="h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-body-sm font-bold text-sf-neutral-9">Tableau AI Portal</span>
            <span className="text-meta font-medium uppercase tracking-widest text-sf-neutral-5">Analytics Platform</span>
          </div>
        </div>

        <div className="w-full max-w-[360px] animate-fade-in">
          <div className="mb-8 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-h1 font-bold tracking-tight text-sf-neutral-10">{t("signIn.welcomeBack")}</h1>
              <p className="mt-2 text-body text-sf-neutral-5">
                {env.PORTAL_ENV === "dev" ? t("signIn.subtitleDev") : t("signIn.subtitleProd")}
              </p>
            </div>
            {/* Mobile/tablet toggle — the hero panel (with its own toggle) is hidden below lg */}
            <div className="lg:hidden">
              <LanguageToggle locale={locale} variant="dark" />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-body-sm text-red-700"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{t("signIn.errorInvalid")}</span>
            </div>
          )}

          <form
            action={async (formData) => {
              "use server";
              await signIn("credentials", {
                email: formData.get("email"),
                password: formData.get("password"),
                redirectTo: next && next.startsWith("/") ? next : "/",
              });
            }}
            className="space-y-5"
          >
            <div>
              <label htmlFor="email" className="mb-1.5 block text-body-sm font-semibold text-sf-neutral-8">
                {t("signIn.emailLabel")}
              </label>
              <input
                id="email"
                type="email"
                name="email"
                required
                autoComplete="email"
                autoFocus
                placeholder="you@company.com"
                className="w-full rounded-xl border border-sf-neutral-3 bg-sf-neutral-1 px-4 py-3 text-body text-sf-neutral-9 outline-none ring-0 transition-all duration-base placeholder:text-sf-neutral-4 hover:border-sf-neutral-4 focus:border-sf-blue-70 focus:bg-white focus:ring-2 focus:ring-sf-blue-10"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-body-sm font-semibold text-sf-neutral-8">
                {t("signIn.passwordLabel")}
              </label>
              <input
                id="password"
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-sf-neutral-3 bg-sf-neutral-1 px-4 py-3 text-body text-sf-neutral-9 outline-none ring-0 transition-all duration-base hover:border-sf-neutral-4 focus:border-sf-blue-70 focus:bg-white focus:ring-2 focus:ring-sf-blue-10"
              />
            </div>

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-sf-blue-60 to-sf-blue-80 px-4 py-3 text-body font-semibold text-white shadow-elev-1 transition-all duration-base hover:-translate-y-px hover:shadow-elev-2 active:scale-[0.99]"
            >
              {t("signIn.submit")}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </form>

          {env.PORTAL_ENV === "dev" && demoLogins.length > 0 && (
            <div className="mt-8 rounded-xl border border-sf-neutral-3 bg-sf-neutral-1 p-4">
              <p className="mb-2.5 text-caption font-semibold uppercase tracking-widest text-sf-neutral-5">
                {t("signIn.demoAccounts")}
              </p>
              <div className="space-y-1.5">
                {demoLogins.map((u) => (
                  <div key={u.email} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-caption text-sf-neutral-6">{u.email}</span>
                    <span className="rounded-full bg-sf-neutral-2 px-2 py-px text-[10px] font-medium text-sf-neutral-5 border border-sf-neutral-3">
                      {u.tenantName}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] text-sf-neutral-4">
                Password: <span className="font-mono">dev</span> · one login per active tenant
              </p>
            </div>
          )}

          <p className="mt-6 text-center text-meta text-sf-neutral-4">
            {t("signIn.consent")}
          </p>
        </div>
      </div>
    </div>
  );
}
