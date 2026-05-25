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
    // Negative margin breaks out of the layout's content padding (p-5 lg:p-7).
    <div className="-m-5 lg:-m-7 flex-1 min-h-0">
      <AgentPage tenantName={ctx.tenantName} />
    </div>
  );
}
