import { describe, expect, it } from "vitest";
import { filterGroups, normalizeText, type LibGroup } from "./LibraryBrowser";

function wb(name: string, views = 1) {
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  return {
    workbookId: slug,
    workbookName: name,
    workbookSlug: slug,
    projectId: "p1",
    projectName: "Sales",
    viewCount: views,
    firstViewSlug: "v1",
  };
}

const GROUPS: LibGroup[] = [
  { project: { id: "p1", name: "Sales" }, workbooks: [wb("Chi nhánh", 3), wb("Doanh thu", 1)] },
  { project: { id: "p2", name: "Ops" }, workbooks: [wb("Tồn kho", 2)] },
];

describe("normalizeText", () => {
  it("strips Vietnamese diacritics and lowercases", () => {
    expect(normalizeText("Chi nhánh")).toBe("chi nhanh");
    expect(normalizeText("Tồn Kho")).toBe("ton kho");
  });
});

describe("filterGroups", () => {
  it("matches diacritic-free query against accented names (acceptance)", () => {
    const out = filterGroups(GROUPS, { q: "chi nhanh", projectId: "all", sort: "name" });
    const names = out.flatMap((g) => g.workbooks.map((w) => w.workbookName));
    expect(names).toEqual(["Chi nhánh"]);
  });

  it("returns every group when the query is empty", () => {
    const out = filterGroups(GROUPS, { q: "", projectId: "all", sort: "name" });
    expect(out.map((g) => g.project.id)).toEqual(["p1", "p2"]);
  });

  it("restricts to a single project when projectId is set", () => {
    const out = filterGroups(GROUPS, { q: "", projectId: "p2", sort: "name" });
    expect(out).toHaveLength(1);
    expect(out[0]!.project.id).toBe("p2");
  });

  it("drops groups with no match", () => {
    const out = filterGroups(GROUPS, { q: "ton kho", projectId: "all", sort: "name" });
    expect(out.map((g) => g.project.id)).toEqual(["p2"]);
  });

  it("sorts by view count desc when sort=views", () => {
    const out = filterGroups(GROUPS, { q: "", projectId: "p1", sort: "views" });
    expect(out[0]!.workbooks.map((w) => w.workbookName)).toEqual(["Chi nhánh", "Doanh thu"]);
  });

  it("sorts by name A–Z when sort=name", () => {
    const out = filterGroups(GROUPS, { q: "", projectId: "p1", sort: "name" });
    expect(out[0]!.workbooks.map((w) => w.workbookName)).toEqual(["Chi nhánh", "Doanh thu"]);
  });
});
