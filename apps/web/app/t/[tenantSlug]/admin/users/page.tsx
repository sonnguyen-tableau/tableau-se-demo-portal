import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { tenantFromSession } from "@/lib/tenant";
import { getLiveCatalog, getCachedWorkbooks } from "@/lib/tableau-rest";
import { listPortalUsers } from "@/lib/portal-users";
import { UserAdminClient } from "./UserAdminClient";

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function UsersAdminPage({ params }: PageProps) {
  const session = await auth();
  const ctx = tenantFromSession(session);
  if (!ctx?.isInternal) notFound();

  const { tenantSlug } = await params;

  await getLiveCatalog(ctx?.tenantId); // populates workbook cache
  const [users, workbooks] = await Promise.all([
    listPortalUsers(),
    Promise.resolve(getCachedWorkbooks()),
  ]);

  // Group workbooks by project for the permission picker
  const byProject = new Map<string, { projectName: string; workbooks: typeof workbooks }>();
  for (const wb of workbooks) {
    if (!byProject.has(wb.projectId)) {
      byProject.set(wb.projectId, { projectName: wb.projectName, workbooks: [] });
    }
    byProject.get(wb.projectId)!.workbooks.push(wb);
  }
  const projectGroups = [...byProject.values()]
    .sort((a, b) => a.projectName.localeCompare(b.projectName, "vi"))
    .map((g) => ({
      ...g,
      workbooks: g.workbooks.sort((a, b) => a.name.localeCompare(b.name, "vi")),
    }));

  return (
    <UserAdminClient
      tenantSlug={tenantSlug}
      tenantId={ctx.tenantId}
      tenantName={ctx.tenantName}
      initialUsers={users}
      projectGroups={projectGroups}
    />
  );
}
