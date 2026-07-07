import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { canAccessTenant, slugify, tenantFromSession, workspaceDisplayName } from "./tenant";

function makeSession(overrides: Partial<NonNullable<Session["user"]>> = {}): Session {
  return {
    user: {
      email: "u@x.com",
      tenantId: "tenant-acme",
      tenantName: "Acme",
      groups: [],
      ...overrides,
    },
    expires: new Date(Date.now() + 60_000).toISOString(),
  } as Session;
}

describe("tenantFromSession", () => {
  it("returns null when session is null", () => {
    expect(tenantFromSession(null)).toBeNull();
  });

  it("marks internal-employees group as internal", () => {
    const ctx = tenantFromSession(
      makeSession({ groups: ["internal-employees"], tenantId: "tenant-acme" }),
    );
    expect(ctx?.isInternal).toBe(true);
  });

  it("treats tenantId='internal' as internal", () => {
    const ctx = tenantFromSession(makeSession({ tenantId: "internal" }));
    expect(ctx?.isInternal).toBe(true);
  });

  it("relabels the meygroup workspace name without changing its id", () => {
    const ctx = tenantFromSession(makeSession({ tenantId: "meygroup", tenantName: "Mey Group" }));
    expect(ctx?.tenantId).toBe("meygroup"); // identity + Tableau routing unchanged
    expect(ctx?.tenantName).toBe("MEYGROUP"); // display label only
  });

  it("leaves other tenants' workspace names untouched", () => {
    const ctx = tenantFromSession(makeSession({ tenantId: "tenant-acme", tenantName: "Acme" }));
    expect(ctx?.tenantName).toBe("Acme");
  });
});

describe("workspaceDisplayName", () => {
  it("overrides meygroup and passes others through", () => {
    expect(workspaceDisplayName("meygroup", "Mey Group")).toBe("MEYGROUP");
    expect(workspaceDisplayName("nam-a-bank", "Nam A Bank")).toBe("Nam A Bank");
  });
});

describe("canAccessTenant", () => {
  it("rejects unauthenticated users", () => {
    expect(canAccessTenant(null, "tenant-acme")).toBe(false);
  });

  it("allows matching tenant", () => {
    const ctx = tenantFromSession(makeSession({ tenantId: "tenant-acme" }));
    expect(canAccessTenant(ctx, "tenant-acme")).toBe(true);
  });

  it("blocks cross-tenant access for non-internal users", () => {
    const ctx = tenantFromSession(makeSession({ tenantId: "tenant-acme" }));
    expect(canAccessTenant(ctx, "tenant-globex")).toBe(false);
  });

  it("internal users can access any tenant", () => {
    const ctx = tenantFromSession(
      makeSession({ tenantId: "internal", groups: ["internal-employees"] }),
    );
    expect(canAccessTenant(ctx, "tenant-globex")).toBe(true);
    expect(canAccessTenant(ctx, "tenant-acme")).toBe(true);
  });
});

describe("slugify", () => {
  it("lowercases and replaces non-alnum with dashes", () => {
    expect(slugify("Acme Bikes Inc.")).toBe("acme-bikes-inc");
  });

  it("trims leading/trailing dashes", () => {
    expect(slugify("---Hello, World!---")).toBe("hello-world");
  });

  it("caps at 48 chars", () => {
    expect(slugify("x".repeat(80)).length).toBe(48);
  });
});
