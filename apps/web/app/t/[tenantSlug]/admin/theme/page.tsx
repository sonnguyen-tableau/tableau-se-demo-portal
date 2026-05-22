import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getTenantTheme } from "@/lib/tenant-theme";
import { ThemeEditor } from "./ThemeEditor";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function ThemePage({ params }: PageProps) {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) notFound();

  const { tenantSlug } = await params;
  const theme = await getTenantTheme(tenantSlug);

  return <ThemeEditor initial={theme} tenantId={tenantSlug} />;
}
