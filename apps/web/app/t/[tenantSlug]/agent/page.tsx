import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { AgentPage } from "./AgentPage";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function AgentPageServer({ params }: PageProps) {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx) notFound();

  const { tenantSlug: _slug } = await params;

  return (
    // Negative margin breaks out of the p-6 wrapper in the tenant layout.
    // height fills viewport minus the lg sidebar (no top bar on desktop).
    <div className="-m-6" style={{ height: "calc(100vh - 57px)" }}>
      <AgentPage tenantName={ctx.tenantName} />
    </div>
  );
}
