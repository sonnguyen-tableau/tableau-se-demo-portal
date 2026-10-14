import { describe, expect, it } from "vitest";
import { buildBreadcrumbs, deSlugify } from "./Breadcrumb";

const CTX = {
  tenantSlug: "acme",
  tenantName: "Acme Corp",
  names: {
    "dashboards/control-tower": "Control Tower",
    "dashboards/control-tower/sales-overview": "Sales Overview",
  },
  labels: {
    dashboards: "All Dashboards",
    agent: "AI Agent",
    admin: "Admin",
  },
};

describe("deSlugify", () => {
  it("turns a slug into a readable label (no raw hyphens/underscores)", () => {
    expect(deSlugify("acb-cards_control-tower")).toBe("Acb Cards Control Tower");
  });
  it("decodes percent-encoding and collapses whitespace", () => {
    expect(deSlugify("q1%20report")).toBe("Q1 Report");
  });
});

describe("buildBreadcrumbs", () => {
  it("returns null outside the tenant prefix", () => {
    expect(buildBreadcrumbs("/admin", CTX)).toBeNull();
    expect(buildBreadcrumbs("/t/other/dashboards", CTX)).toBeNull();
  });

  it("shows the tenant name alone at the tenant root", () => {
    const crumbs = buildBreadcrumbs("/t/acme", CTX)!;
    expect(crumbs).toEqual([{ label: "Acme Corp", href: "/t/acme" }]);
  });

  it("maps a static segment through the i18n labels", () => {
    const crumbs = buildBreadcrumbs("/t/acme/dashboards", CTX)!;
    expect(crumbs.map((c) => c.label)).toEqual(["Acme Corp", "All Dashboards"]);
  });

  it("resolves workbook + view slugs to human names — never the raw slug", () => {
    const crumbs = buildBreadcrumbs("/t/acme/dashboards/control-tower/sales-overview", CTX)!;
    expect(crumbs.map((c) => c.label)).toEqual([
      "Acme Corp",
      "All Dashboards",
      "Control Tower",
      "Sales Overview",
    ]);
    // Acceptance: no slug is ever visible.
    const labels = crumbs.map((c) => c.label).join(" ");
    expect(labels).not.toMatch(/control-tower|sales-overview/);
  });

  it("builds cumulative hrefs for each crumb", () => {
    const crumbs = buildBreadcrumbs("/t/acme/dashboards/control-tower", CTX)!;
    expect(crumbs.map((c) => c.href)).toEqual([
      "/t/acme",
      "/t/acme/dashboards",
      "/t/acme/dashboards/control-tower",
    ]);
  });

  it("de-slugifies an unknown segment instead of showing the slug", () => {
    const crumbs = buildBreadcrumbs("/t/acme/some-unknown-page", CTX)!;
    expect(crumbs.at(-1)!.label).toBe("Some Unknown Page");
  });
});
