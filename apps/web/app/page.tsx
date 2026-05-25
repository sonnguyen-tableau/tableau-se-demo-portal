import Link from "next/link";
import { auth } from "@/lib/auth";
import { SalesforceBankIcon } from "@/components/SalesforceBankLogo";

const FEATURES = [
  {
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    ),
    title: "Dashboard nhúng",
    desc: "Tableau views với JWT auth, Row-Level Security và giới hạn lượt xem theo tenant.",
  },
  {
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.091 3.091z" />
    ),
    title: "AI Chat Agent",
    desc: "Trợ lý phân tích đặt câu hỏi ngôn ngữ tự nhiên, trả về chart Vega-Lite và bảng dữ liệu.",
  },
  {
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    ),
    title: "Đa khách hàng",
    desc: "Workspace riêng biệt cho từng tenant với phân quyền và thương hiệu tuỳ chỉnh.",
  },
];

export default async function Home() {
  const session = await auth();

  return (
    <div
      className="relative flex min-h-dvh flex-col overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(180deg, var(--brand-neutral) 0%, color-mix(in oklab, var(--brand-neutral) 88%, #000 12%) 100%)",
      }}
    >
      {/* Ambient mesh + glows */}
      <div className="pointer-events-none absolute inset-0 bg-mesh-brand opacity-50 mix-blend-screen" aria-hidden="true" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-brand/25 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-sf-blue-60/15 blur-3xl" aria-hidden="true" />

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav className="relative flex items-center justify-between border-b border-white/[0.06] px-6 py-4 backdrop-blur-sm sm:px-10">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] ring-1 ring-white/15">
            <SalesforceBankIcon size={26} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-body-sm font-bold tracking-tight">Salesforce Bank</span>
            <span className="text-meta font-medium uppercase tracking-[0.16em] text-sf-blue-40">Analytics Portal</span>
          </div>
        </div>
        {session?.user ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-caption text-white/55 sm:block">{session.user.email}</span>
            <Link
              href={`/t/${session.user.tenantId}`}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-sf-blue-60 to-sf-blue-70 px-4 py-2 text-body-sm font-semibold text-white shadow-elev-1 transition-all duration-base ease-smooth hover:shadow-glow-brand active:scale-[0.98]"
            >
              Mở Portal
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        ) : (
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-sf-blue-60 to-sf-blue-70 px-4 py-2 text-body-sm font-semibold text-white shadow-elev-1 transition-all duration-base ease-smooth hover:shadow-glow-brand active:scale-[0.98]"
          >
            Đăng nhập
          </Link>
        )}
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-20 text-center animate-fade-in">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.05] px-3.5 py-1 text-meta font-semibold uppercase tracking-[0.14em] text-sf-blue-40 backdrop-blur-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-sf-blue-40 opacity-60" aria-hidden="true" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-sf-blue-40" />
          </span>
          Powered by Claude AI + Tableau Cloud
        </div>

        <h1 className="mb-5 max-w-3xl text-display font-extrabold leading-[1.05] tracking-tight">
          Phân tích dữ liệu thông minh
          <span className="mt-2 block bg-gradient-to-r from-white via-sf-blue-40 to-cyan-300 bg-clip-text text-transparent">
            dành cho ngân hàng hiện đại
          </span>
        </h1>
        <p className="mb-10 max-w-xl text-body-lg leading-relaxed text-white/65">
          Dashboard Tableau nhúng đa khách hàng kết hợp AI Agent được hỗ trợ bởi Claude. Đặt câu hỏi, khám phá dữ liệu, nhận thông tin chi tiết — tất cả trong một nền tảng.
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          {session?.user ? (
            <Link
              href={`/t/${session.user.tenantId}`}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-sf-blue-60 to-sf-blue-70 px-7 py-3 text-body-sm font-bold text-white shadow-elev-2 transition-all duration-base ease-smooth hover:-translate-y-px hover:shadow-glow-brand active:scale-[0.98]"
            >
              Mở không gian làm việc
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ) : (
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-sf-blue-60 to-sf-blue-70 px-7 py-3 text-body-sm font-bold text-white shadow-elev-2 transition-all duration-base ease-smooth hover:-translate-y-px hover:shadow-glow-brand active:scale-[0.98]"
            >
              Bắt đầu ngay
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
          <Link
            href="/api/health"
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.05] px-7 py-3 text-body-sm font-semibold text-white backdrop-blur-sm transition-all duration-base ease-smooth hover:-translate-y-px hover:border-white/20 hover:bg-white/[0.10]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Kiểm tra hệ thống
          </Link>
        </div>

        {/* Feature cards */}
        <div className="mt-20 grid w-full max-w-4xl gap-4 text-left sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-sm transition-all duration-base ease-smooth hover:-translate-y-1 hover:border-sf-blue-40/30 hover:bg-white/[0.08] hover:shadow-elev-3"
            >
              <span
                className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-gradient-to-r from-transparent via-sf-blue-40 to-transparent transition-transform duration-base ease-smooth group-hover:scale-x-100"
                aria-hidden="true"
              />
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-sf-blue-60/20 to-sf-blue-40/10 text-sf-blue-40 ring-1 ring-white/10">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                  {f.icon}
                </svg>
              </div>
              <h3 className="mb-1.5 text-body-lg font-bold text-white">{f.title}</h3>
              <p className="text-body-sm leading-relaxed text-white/60">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="relative border-t border-white/[0.06] py-5 text-center text-meta text-white/40">
        © 2026 Salesforce Bank — Analytics Portal · Chỉ dùng nội bộ
      </footer>
    </div>
  );
}
