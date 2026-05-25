import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { env } from "@/lib/env";
import { SalesforceBankIcon } from "@/components/SalesforceBankLogo";

interface PageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const session = await auth();
  const { next, error } = await searchParams;
  if (session?.user) redirect(next && next.startsWith("/") ? next : "/");

  return (
    <div className="flex min-h-dvh bg-sf-neutral-2">
      {/* ── Left panel — brand ───────────────────────────────────── */}
      <div
        className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 text-white lg:flex"
        style={{
          background:
            "linear-gradient(160deg, var(--brand-neutral) 0%, color-mix(in oklab, var(--brand-neutral) 75%, var(--brand-primary) 25%) 100%)",
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-mesh-brand opacity-50 mix-blend-screen" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-20 top-1/3 h-72 w-72 rounded-full bg-sf-blue-60/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-brand/30 blur-3xl" aria-hidden="true" />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.10] ring-1 ring-white/15">
            <SalesforceBankIcon size={28} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-body font-bold text-white">Salesforce Bank</span>
            <span className="text-meta font-medium uppercase tracking-[0.16em] text-sf-blue-40">Analytics Portal</span>
          </div>
        </div>

        <div className="relative max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.06] px-3 py-1 text-meta font-semibold uppercase tracking-[0.14em] text-sf-blue-40 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-sf-blue-40 animate-pulse" />
            Powered by Tableau + Claude
          </span>
          <h2 className="mt-5 text-display font-extrabold leading-tight tracking-tight">
            Dữ liệu sẵn sàng.
            <br />
            <span className="bg-gradient-to-r from-sf-blue-40 to-cyan-300 bg-clip-text text-transparent">
              Quyết định nhanh hơn.
            </span>
          </h2>
          <p className="mt-4 text-body-lg leading-relaxed text-white/70">
            Nền tảng phân tích tập trung cho toàn bộ hệ sinh thái ngân hàng — dashboard thời gian thực và AI Agent trong tầm tay.
          </p>
        </div>

        <p className="relative text-meta text-white/40">© 2026 Salesforce Bank · Chỉ dùng nội bộ</p>
      </div>

      {/* ── Right panel — form ───────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-12">
        {/* Mobile logo */}
        <div className="mb-10 flex items-center gap-2.5 lg:hidden">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-neutral text-white shadow-elev-1">
            <SalesforceBankIcon size={24} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-body-sm font-bold text-sf-neutral-9">Salesforce Bank</span>
            <span className="text-meta font-medium uppercase tracking-[0.16em] text-brand">Analytics Portal</span>
          </div>
        </div>

        <div className="w-full max-w-sm animate-fade-in">
          <h1 className="text-h1 font-bold tracking-tight text-sf-neutral-10">Đăng nhập</h1>
          <p className="mt-2 text-body text-sf-neutral-6">
            {env.PORTAL_ENV === "dev"
              ? "Chế độ phát triển — dùng tài khoản dev đã cấu hình sẵn."
              : "Đăng nhập một lần (SSO) qua nhà cung cấp danh tính của tổ chức."}
          </p>

          {error && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-body-sm text-red-700"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Đăng nhập thất bại. Kiểm tra lại email và mật khẩu.</span>
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
            className="mt-7 space-y-4"
          >
            <div>
              <label className="mb-1.5 block text-body-sm font-semibold text-sf-neutral-8">
                Email
              </label>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@salesforce.com"
                className="w-full rounded-lg border border-sf-neutral-3 bg-white px-3.5 py-2.5 text-body text-sf-neutral-9 outline-none transition-colors duration-base ease-smooth placeholder:text-sf-neutral-4 hover:border-sf-neutral-4 focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-body-sm font-semibold text-sf-neutral-8">
                Mật khẩu
              </label>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-sf-neutral-3 bg-white px-3.5 py-2.5 text-body text-sf-neutral-9 outline-none transition-colors duration-base ease-smooth hover:border-sf-neutral-4 focus:border-brand"
              />
            </div>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-brand to-sf-blue-80 px-4 py-2.5 text-body font-semibold text-white shadow-elev-1 transition-all duration-base ease-smooth hover:shadow-glow-brand active:scale-[0.99]"
            >
              Đăng nhập
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </form>

          <p className="mt-6 text-center text-meta text-sf-neutral-5">
            Bằng việc đăng nhập, bạn đồng ý với chính sách bảo mật và điều khoản sử dụng nội bộ.
          </p>
        </div>
      </div>
    </div>
  );
}
