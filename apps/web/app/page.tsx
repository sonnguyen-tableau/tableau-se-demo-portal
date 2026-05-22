import Link from "next/link";
import { auth } from "@/lib/auth";
import { SalesforceBankIcon } from "@/components/SalesforceBankLogo";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex min-h-dvh flex-col bg-sf-blue-90 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b border-white/10 px-8 py-4">
        <div className="flex items-center gap-3">
          <SalesforceBankIcon size={34} />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-tight">Salesforce Bank</span>
            <span className="text-[10px] font-medium tracking-widest text-blue-300 uppercase">Analytics Portal</span>
          </div>
        </div>
        {session?.user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-blue-300">{session.user.email}</span>
            <Link
              href={`/t/${session.user.tenantId}`}
              className="rounded-lg bg-sf-blue-60 px-4 py-2 text-sm font-semibold text-white shadow-sf-sm transition hover:bg-sf-blue-70"
            >
              Mở Portal
            </Link>
          </div>
        ) : (
          <Link
            href="/sign-in"
            className="rounded-lg bg-sf-blue-60 px-4 py-2 text-sm font-semibold text-white shadow-sf-sm transition hover:bg-sf-blue-70"
          >
            Đăng nhập
          </Link>
        )}
      </nav>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sf-blue-60/40 bg-sf-blue-80/50 px-4 py-1.5 text-xs font-semibold text-blue-300 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-sf-blue-60 animate-pulse" />
          Được hỗ trợ bởi Claude AI + Tableau Cloud
        </div>

        <h1 className="mb-5 max-w-3xl text-5xl font-extrabold tracking-tight leading-tight">
          Phân tích dữ liệu thông minh
          <span className="block bg-gradient-to-r from-sf-blue-40 to-cyan-300 bg-clip-text text-transparent">
            dành cho ngân hàng hiện đại
          </span>
        </h1>
        <p className="mb-10 max-w-xl text-base text-blue-200 leading-relaxed">
          Dashboard Tableau nhúng đa khách hàng kết hợp AI Agent được hỗ trợ bởi Claude.
          Đặt câu hỏi, khám phá dữ liệu, nhận thông tin chi tiết — tất cả trong một nền tảng.
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          {session?.user ? (
            <Link
              href={`/t/${session.user.tenantId}`}
              className="rounded-xl bg-sf-blue-60 px-7 py-3 text-sm font-bold text-white shadow-sf-md transition hover:bg-sf-blue-70"
            >
              Mở không gian làm việc
            </Link>
          ) : (
            <Link
              href="/sign-in"
              className="rounded-xl bg-sf-blue-60 px-7 py-3 text-sm font-bold text-white shadow-sf-md transition hover:bg-sf-blue-70"
            >
              Bắt đầu ngay
            </Link>
          )}
          <Link
            href="/api/health"
            className="rounded-xl border border-white/20 bg-white/8 px-7 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/15"
          >
            Kiểm tra hệ thống
          </Link>
        </div>

        {/* Feature cards */}
        <div className="mt-20 grid max-w-4xl gap-4 text-left sm:grid-cols-3">
          {[
            {
              icon: "📊",
              title: "Dashboard nhúng",
              desc: "Tableau views với JWT auth, Row-Level Security và giới hạn lượt xem theo tenant.",
            },
            {
              icon: "🤖",
              title: "AI Chat Agent",
              desc: "Trợ lý phân tích đặt câu hỏi ngôn ngữ tự nhiên, trả về chart Vega-Lite và bảng dữ liệu.",
            },
            {
              icon: "🏢",
              title: "Đa khách hàng",
              desc: "Workspace riêng biệt cho từng tenant với phân quyền và thương hiệu tuỳ chỉnh.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-white/10 bg-white/6 p-6 backdrop-blur-sm transition hover:bg-white/10"
            >
              <div className="mb-3 text-2xl">{f.icon}</div>
              <h3 className="mb-1.5 font-bold text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-blue-200">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-white/10 py-5 text-center text-xs text-blue-400">
        © 2026 Salesforce Bank — Analytics Portal · Chỉ dùng nội bộ
      </footer>
    </div>
  );
}
