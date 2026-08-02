import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenants";
import { getAgentSuggestions } from "@/lib/agent-suggestions";
import { getLocale } from "@/lib/i18n";
import { AgentPage } from "./AgentPage";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function AgentPageServer({ params }: PageProps) {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx) notFound();

  const { tenantSlug } = await params;
  const [tenantRecord, locale] = await Promise.all([getTenant(tenantSlug), getLocale()]);
  const suggestions = getAgentSuggestions({
    slug: tenantSlug,
    industry: tenantRecord?.industry,
    locale,
  });

  return (
    // Negative margin breaks out of the layout's content padding (p-5 lg:p-7).
    <div className="-m-5 lg:-m-7 flex-1 min-h-0">
      <AgentPage tenantName={ctx.tenantName} suggestions={suggestions} locale={locale} />
    </div>
  );
}
