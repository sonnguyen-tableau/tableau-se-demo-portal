import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { FactoryProgress } from "@/components/factory/FactoryProgress";

interface PageProps {
  params: Promise<{ jobId: string }>;
}

export default async function FactoryJobPage({ params }: PageProps) {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) notFound();
  const { jobId } = await params;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header>
        <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Demo Factory
        </p>
        <h1 className="text-2xl font-semibold">Job {jobId}</h1>
      </header>
      <FactoryProgress jobId={jobId} />
    </main>
  );
}
