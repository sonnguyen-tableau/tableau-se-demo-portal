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
      {/* Left panel — brand */}
      <div className="hidden w-1/2 flex-col justify-between bg-sf-blue-90 p-12 lg:flex">
        <div className="flex items-center gap-3">
          <SalesforceBankIcon size={36} />
          <div className="flex flex-col leading-tight">
            <span className="text-base font-bold text-white">Salesforce Bank</span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-blue-300">Analytics Portal</span>
          </div>
        </div>

        <div>
          <h2 className="text-4xl font-extrabold leading-tight text-white">
            Dữ liệu sẵn sàng.<br />
            <span className="text-sf-blue-40">Quyết định nhanh hơn.</span>
          </h2>
          <p className="mt-4 text-base text-blue-200 leading-relaxed max-w-sm">
            Nền tảng phân tích tập trung cho toàn bộ hệ sinh thái ngân hàng —
            dashboard thời gian thực và AI Agent trong tầm tay.
          </p>
        </div>

        <p className="text-xs text-blue-400">© 2026 Salesforce Bank · Chỉ dùng nội bộ</p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <SalesforceBankIcon size={30} />
          <span className="font-bold text-sf-neutral-9">Salesforce Bank</span>
        </div>

        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-extrabold text-sf-neutral-9">Đăng nhập</h1>
          <p className="mt-1.5 text-sm text-sf-neutral-6">
            {env.PORTAL_ENV === "dev"
              ? "Chế độ phát triển — dùng tài khoản dev đã cấu hình sẵn."
              : "Đăng nhập một lần (SSO) qua nhà cung cấp danh tính của tổ chức."}
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Đăng nhập thất bại. Kiểm tra lại email và mật khẩu.
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
              <label className="mb-1.5 block text-sm font-semibold text-sf-neutral-8">
                Email
              </label>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@salesforce.com"
                className="w-full rounded-lg border border-sf-neutral-3 bg-white px-3.5 py-2.5 text-sm text-sf-neutral-9 outline-none placeholder:text-sf-neutral-4 focus:border-sf-blue-70 focus:ring-2 focus:ring-sf-blue-10 transition"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-sf-neutral-8">
                Mật khẩu
              </label>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-sf-neutral-3 bg-white px-3.5 py-2.5 text-sm text-sf-neutral-9 outline-none focus:border-sf-blue-70 focus:ring-2 focus:ring-sf-blue-10 transition"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-sf-blue-70 px-4 py-2.5 text-sm font-bold text-white shadow-sf-sm transition hover:bg-sf-blue-80 active:scale-[0.99]"
            >
              Đăng nhập
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
