import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, tenantFromSessionMock, getUserCatalogMock, fetchPreviewMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  tenantFromSessionMock: vi.fn(),
  getUserCatalogMock: vi.fn(),
  fetchPreviewMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/tenant", () => ({
  tenantFromSession: tenantFromSessionMock,
  canAccessTenant: (ctx: { tenantId: string; isInternal?: boolean } | null, slug: string) =>
    !!ctx && (ctx.isInternal === true || ctx.tenantId === slug),
}));
vi.mock("@/lib/user-catalog", () => ({ getUserCatalog: getUserCatalogMock }));
vi.mock("@/lib/tableau-rest", () => ({ fetchViewPreviewImage: fetchPreviewMock }));

import { GET } from "./route";

const OWN_VIEW = { workbookSlug: "control-tower", viewSlug: "overview", workbookId: "WB-1", viewId: "V-1" };

function req(qs: string): Request {
  return new Request(`http://localhost/api/tableau/thumbnail${qs}`);
}

beforeEach(() => {
  authMock.mockReset();
  tenantFromSessionMock.mockReset();
  getUserCatalogMock.mockReset();
  fetchPreviewMock.mockReset();

  authMock.mockResolvedValue({ user: { email: "user@tenant-a.com" } });
  tenantFromSessionMock.mockReturnValue({ tenantId: "tenant-a" });
  getUserCatalogMock.mockResolvedValue({ projects: [], dashboards: [OWN_VIEW] });
  fetchPreviewMock.mockResolvedValue({ bytes: new ArrayBuffer(8), contentType: "image/png" });
});

describe("GET /api/tableau/thumbnail", () => {
  it("401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    expect((await GET(req("?wb=control-tower&view=overview"))).status).toBe(401);
    expect(fetchPreviewMock).not.toHaveBeenCalled();
  });

  it("403 when the session has no tenant context", async () => {
    tenantFromSessionMock.mockReturnValue(null);
    expect((await GET(req("?wb=control-tower&view=overview"))).status).toBe(403);
    expect(fetchPreviewMock).not.toHaveBeenCalled();
  });

  it("400 when wb or view is missing", async () => {
    expect((await GET(req("?wb=control-tower"))).status).toBe(400);
    expect((await GET(req("?view=overview"))).status).toBe(400);
    expect(fetchPreviewMock).not.toHaveBeenCalled();
  });

  it("404 (and no PAT fetch) for a view NOT in the user's visible catalog — cross-tenant denial", async () => {
    // The user's catalog only contains their own view; another tenant's slugs
    // are absent, so the request is denied before any privileged PAT call.
    const res = await GET(req("?wb=other-tenant-wb&view=secret-view"));
    expect(res.status).toBe(404);
    expect(fetchPreviewMock).not.toHaveBeenCalled();
  });

  it("serves the image for a view IN the user's catalog, keyed by its real IDs", async () => {
    const res = await GET(req("?wb=control-tower&view=overview"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
    // Resolved to the catalog entry's workbookId/viewId, not the raw query.
    expect(fetchPreviewMock).toHaveBeenCalledWith("tenant-a", "WB-1", "V-1");
  });

  it("502 (client falls back to icon) when the Tableau fetch fails", async () => {
    // Distinct viewId so this doesn't hit the module-level byte cache warmed by
    // the success test above.
    getUserCatalogMock.mockResolvedValue({
      projects: [],
      dashboards: [{ workbookSlug: "ct2", viewSlug: "ov2", workbookId: "WB-2", viewId: "V-2" }],
    });
    fetchPreviewMock.mockRejectedValue(new Error("tableau down"));
    const res = await GET(req("?wb=ct2&view=ov2"));
    expect(res.status).toBe(502);
  });
});
