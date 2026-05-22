import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getLiveCatalog, getCachedWorkbooks } from "@/lib/tableau-rest";
import { getHiddenWorkbookIds } from "@/lib/catalog-filter";
import { CatalogFilterAdmin } from "./CatalogFilterAdmin";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function AdminPage({ params }: PageProps) {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) notFound();

  const { tenantSlug } = await params;

  // Ensure catalog is fetched so workbook cache is populated
  await getLiveCatalog();
  const workbooks = getCachedWorkbooks();
  const hiddenIds = [...(await getHiddenWorkbookIds())];

  // Group workbooks by project for display
  const byProject = new Map<string, { projectName: string; workbooks: typeof workbooks }>();
  for (const wb of workbooks) {
    if (!byProject.has(wb.projectId)) {
      byProject.set(wb.projectId, { projectName: wb.projectName, workbooks: [] });
    }
    byProject.get(wb.projectId)!.workbooks.push(wb);
  }
  const projects = [...byProject.values()].sort((a, b) =>
    a.projectName.localeCompare(b.projectName, "vi"),
  );
  for (const p of projects) {
    p.workbooks.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }

  return (
    <CatalogFilterAdmin
      tenantSlug={tenantSlug}
      projects={projects}
      initialHiddenIds={hiddenIds}
    />
  );
}
