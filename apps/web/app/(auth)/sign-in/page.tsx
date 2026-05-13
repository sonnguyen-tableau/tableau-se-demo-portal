import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { env } from "@/lib/env";

interface PageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const session = await auth();
  const { next, error } = await searchParams;
  if (session?.user) redirect(next && next.startsWith("/") ? next : "/");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
        {env.PORTAL_ENV === "dev"
          ? "Development credentials provider. Use one of the seeded dev users (see apps/web/.env.example)."
          : "Single sign-on (replace with your IdP provider in apps/web/lib/auth.ts)."}
      </p>

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          Sign-in failed. Check email & password.
        </div>
      ) : null}

      <form
        action={async (formData) => {
          "use server";
          await signIn("credentials", {
            email: formData.get("email"),
            password: formData.get("password"),
            redirectTo: next && next.startsWith("/") ? next : "/",
          });
        }}
        className="mt-6 space-y-4"
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 outline-none focus:border-brand"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Password</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 outline-none focus:border-brand"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
