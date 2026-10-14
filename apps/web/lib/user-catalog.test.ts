import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveDashboard, LiveProject } from "./tableau-rest";

// Mirror the hoisted-mock pattern used in tableau-admin.test.ts: stub the four
// collaborators so we test getUserCatalog's own compose/filter logic in isolation.
const { getLiveCatalogMock, getVisibleWorkbookIdsMock, getTenantMock, tenantFromSessionMock } =
  vi.hoisted(() => ({
    getLiveCatalogMock: vi.fn(),
    getVisibleWorkbookIdsMock: vi.fn(),
    getTenantMock: vi.fn(),
    tenantFromSessionMock: vi.fn(),
  }));

vi.mock("@/lib/tableau-rest", () => ({ getLiveCatalog: getLiveCatalogMock }));
vi.mock("@/lib/catalog-filter", () => ({ getVisibleWorkbookIds: getVisibleWorkbookIdsMock }));
vi.mock("@/lib/tenants", () => ({ getTenant: getTenantMock }));
vi.mock("@/lib/tenant", () => ({
  tenantFromSession: tenantFromSessionMock,
  // Real-equivalent so the FX-06 fail-closed guard is exercised, not stubbed out.
  canAccessTenant: (ctx: { tenantId: string; isInternal?: boolean } | null, slug: string) =>
    !!ctx && (ctx.isInternal === true || ctx.tenantId === slug),
}));

import { getUserCatalog } from "./user-catalog";

const P1: LiveProject = { id: "p1", name: "Sales" };
const P2: LiveProject = { id: "p2", name: "Ops" };

function dash(workbookId: string, project: LiveProject, viewSlug = "v1"): LiveDashboard {
  return {
    id: `${workbookId}-${viewSlug}`,
    workbookSlug: workbookId,
    viewSlug,
    name: viewSlug,
    workbookId,
    viewId: `${workbookId}-${viewSlug}-luid`,
    workbookName: workbookId,
    viewName: viewSlug,
    viewPath: `${workbookId}/${viewSlug}`,
    projectId: project.id,
    projectName: project.name,
  };
}

const VISIBLE = dash("wb-visible", P1);
const HIDDEN = dash("wb-hidden", P2);
const SESSION = { user: { email: "user@tenant.com" } } as never;

beforeEach(() => {
  getLiveCatalogMock.mockReset();
  getVisibleWorkbookIdsMock.mockReset();
  getTenantMock.mockReset();
  tenantFromSessionMock.mockReset();

  tenantFromSessionMock.mockReturnValue({ tenantId: "tenant-1" });
  getTenantMock.mockResolvedValue({ allowedProjects: ["Demo/Sales", "Demo/Ops"] });
  getLiveCatalogMock.mockResolvedValue({
    projects: [P1, P2],
    dashboards: [VISIBLE, HIDDEN],
    fetchedAt: 0,
  });
});

describe("getUserCatalog", () => {
  it("drops dashboards whose workbook is not in the visible set (hidden disappears)", async () => {
    getVisibleWorkbookIdsMock.mockResolvedValue(new Set(["wb-visible"]));

    const { dashboards } = await getUserCatalog(SESSION, "tenant-1");

    expect(dashboards.map((d) => d.workbookId)).toEqual(["wb-visible"]);
    expect(dashboards.some((d) => d.workbookId === "wb-hidden")).toBe(false);
  });

  it("returns every dashboard when the visibility filter is null (no per-user filtering)", async () => {
    getVisibleWorkbookIdsMock.mockResolvedValue(null);

    const { dashboards } = await getUserCatalog(SESSION, "tenant-1");

    expect(dashboards.map((d) => d.workbookId).sort()).toEqual(["wb-hidden", "wb-visible"]);
  });

  it("returns projects unfiltered even when a project has no visible dashboards", async () => {
    // Only wb-visible (project p1) is visible; p2 has no visible dashboards, but
    // the project list is kept intact so the sidebar tree keeps its nesting.
    getVisibleWorkbookIdsMock.mockResolvedValue(new Set(["wb-visible"]));

    const { projects } = await getUserCatalog(SESSION, "tenant-1");

    expect(projects.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("threads tenantId + allowedProjects into both fetchers (no cross-scope leak)", async () => {
    getVisibleWorkbookIdsMock.mockResolvedValue(null);

    await getUserCatalog(SESSION, "tenant-1");

    expect(getLiveCatalogMock).toHaveBeenCalledWith("tenant-1", ["Demo/Sales", "Demo/Ops"]);
    expect(getVisibleWorkbookIdsMock).toHaveBeenCalledWith(
      "user@tenant.com",
      "tenant-1",
      ["Demo/Sales", "Demo/Ops"],
    );
  });

  it("fails closed for a null session — empty catalog, no fetch (FX-06)", async () => {
    // tenantFromSession(null) → null → canAccessTenant false → no catalog work.
    tenantFromSessionMock.mockReturnValue(null);

    const { projects, dashboards } = await getUserCatalog(null, "tenant-1");

    expect(projects).toEqual([]);
    expect(dashboards).toEqual([]);
    expect(getLiveCatalogMock).not.toHaveBeenCalled();
    expect(getVisibleWorkbookIdsMock).not.toHaveBeenCalled();
  });

  it("fails closed when a non-internal user requests another tenant (FX-06)", async () => {
    tenantFromSessionMock.mockReturnValue({ tenantId: "tenant-1", isInternal: false });

    const { dashboards } = await getUserCatalog(SESSION, "tenant-2");

    expect(dashboards).toEqual([]);
    expect(getLiveCatalogMock).not.toHaveBeenCalled();
  });

  it("lets an internal user read another tenant's catalog, scoped to the URL slug (FX-06)", async () => {
    tenantFromSessionMock.mockReturnValue({ tenantId: "internal", isInternal: true });
    getVisibleWorkbookIdsMock.mockResolvedValue(null);

    await getUserCatalog(SESSION, "tenant-2");

    // Fetches are scoped to the URL slug (tenant-2), not the session tenant.
    expect(getLiveCatalogMock).toHaveBeenCalledWith("tenant-2", ["Demo/Sales", "Demo/Ops"]);
    expect(getVisibleWorkbookIdsMock).toHaveBeenCalledWith(
      "user@tenant.com",
      "tenant-2",
      ["Demo/Sales", "Demo/Ops"],
    );
  });
});
