import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    TABLEAU_PAT_NAME: "test-pat-name",
    TABLEAU_PAT_SECRET: "test-pat-secret",
  },
}));

vi.mock("@/lib/tenant-site", () => ({
  getSiteForTenant: vi.fn().mockResolvedValue({
    tableauSite: "https://tableau.example.com",
    tableauSiteName: "vietnam",
    tableauSiteVersion: "2026.1",
    connectedAppClientId: "",
    connectedAppSecretId: "",
    connectedAppSecretValue: "",
    mcpUrl: undefined,
    factoryUrl: undefined,
    fromRegistry: false,
  }),
  resolvedSiteOrigin: () => "https://tableau.example.com",
}));

const { getLiveCatalogMock, invalidateCatalogCacheMock } = vi.hoisted(() => ({
  getLiveCatalogMock: vi.fn(),
  invalidateCatalogCacheMock: vi.fn(),
}));
vi.mock("@/lib/tableau-rest", () => ({
  getLiveCatalog: getLiveCatalogMock,
  invalidateCatalogCache: invalidateCatalogCacheMock,
}));

import { deleteTableauProject, projectExists, resolveProjectId } from "./tableau-admin";

function signInResponse() {
  return new Response(
    JSON.stringify({ credentials: { token: "tok-123", site: { id: "site-1" } } }),
    { status: 200 },
  );
}

function projectsPage(projects: { id: string; name: string; parentProjectId?: string }[]) {
  return new Response(
    JSON.stringify({
      projects: { project: projects },
      pagination: { pageNumber: "1", pageSize: "100", totalAvailable: String(projects.length) },
    }),
    { status: 200 },
  );
}

describe("tableau-admin", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    getLiveCatalogMock.mockReset();
    invalidateCatalogCacheMock.mockReset();
  });

  describe("resolveProjectId", () => {
    it("walks a 2-segment path to the leaf project's ID", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        projectsPage([
          { id: "p-demo", name: "Demo" },
          { id: "p-child", name: "ACB Cards", parentProjectId: "p-demo" },
          { id: "p-other", name: "Other" },
        ]),
      );
      vi.stubGlobal("fetch", fetchMock);

      const id = await resolveProjectId("Demo/ACB Cards", "site-1", "https://tableau.example.com/api/3.20", "tok-123");
      expect(id).toBe("p-child");
    });

    it("returns null when a path segment doesn't exist", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        projectsPage([{ id: "p-demo", name: "Demo" }]),
      );
      vi.stubGlobal("fetch", fetchMock);

      const id = await resolveProjectId("Demo/Nonexistent", "site-1", "https://tableau.example.com/api/3.20", "tok-123");
      expect(id).toBeNull();
    });
  });

  describe("deleteTableauProject", () => {
    it("returns deleted:false with 'project not found' when resolution fails, without calling DELETE", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(signInResponse()) // signin
        .mockResolvedValueOnce(projectsPage([{ id: "p-demo", name: "Demo" }])) // projects list
        .mockResolvedValueOnce(new Response(null, { status: 204 })); // signout
      vi.stubGlobal("fetch", fetchMock);

      const result = await deleteTableauProject("Demo/Nonexistent");
      expect(result).toEqual({ deleted: false, error: "project not found" });

      const deleteCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
      expect(deleteCalls).toHaveLength(0);
    });

    it("returns deleted:true on a mocked 204 DELETE response", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(signInResponse()) // signin
        .mockResolvedValueOnce(
          projectsPage([
            { id: "p-demo", name: "Demo" },
            { id: "p-child", name: "ACB Cards", parentProjectId: "p-demo" },
          ]),
        ) // projects list
        .mockResolvedValueOnce(new Response(null, { status: 204 })) // DELETE
        .mockResolvedValueOnce(new Response(null, { status: 204 })); // signout
      vi.stubGlobal("fetch", fetchMock);

      const result = await deleteTableauProject("Demo/ACB Cards");
      expect(result).toEqual({ deleted: true, projectId: "p-child" });

      const deleteCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0]?.[0]).toContain("/sites/site-1/projects/p-child");
    });
  });

  describe("projectExists", () => {
    it("returns true when getLiveCatalog reports a matching project", async () => {
      getLiveCatalogMock.mockResolvedValueOnce({
        projects: [{ id: "p-child", name: "ACB Cards", parentProjectId: "p-demo" }],
        dashboards: [],
        fetchedAt: Date.now(),
      });

      const exists = await projectExists("Demo/ACB Cards");
      expect(exists).toBe(true);
      expect(invalidateCatalogCacheMock).toHaveBeenCalled();
    });

    it("returns false when getLiveCatalog reports no matching project", async () => {
      getLiveCatalogMock.mockResolvedValueOnce({ projects: [], dashboards: [], fetchedAt: Date.now() });

      const exists = await projectExists("Demo/Gone");
      expect(exists).toBe(false);
    });
  });
});
