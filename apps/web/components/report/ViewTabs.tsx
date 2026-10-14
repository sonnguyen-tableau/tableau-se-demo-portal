"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useVizContext } from "@/components/bridge/VizContextProvider";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

export interface ViewTab {
  viewSlug: string;
  viewName: string;
}

/**
 * In-place sheet switcher (RV-01, DESIGN §4.5). Clicking a tab calls
 * `activateSheetAsync` on the embedded workbook and updates the URL via
 * history.pushState (Next 15 syncs usePathname) — no page navigation, no new
 * token, no extra impression. Back/Forward re-activate the matching sheet.
 * Falls back to a normal router navigation if the workbook was published
 * without "Show sheets as tabs" (activateSheetAsync rejects → ok:false).
 */
export function ViewTabs({
  tenantSlug,
  workbookSlug,
  workbookName,
  projectName,
  tabs,
  locale = DEFAULT_LOCALE,
}: {
  tenantSlug: string;
  workbookSlug: string;
  workbookName: string;
  projectName: string;
  tabs: ViewTab[];
  locale?: Locale;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const t = translator(locale);
  const { applyVizAction, update } = useVizContext();

  // The active sheet is derived from the URL's last segment, which pushState +
  // Next keep in sync — so the highlight tracks both clicks and Back/Forward.
  const activeSlug = pathname.split("/").filter(Boolean).pop() ?? "";

  const hrefFor = useCallback(
    (viewSlug: string) => `/t/${tenantSlug}/dashboards/${workbookSlug}/${viewSlug}`,
    [tenantSlug, workbookSlug],
  );

  const recordView = useCallback(
    (tab: ViewTab) => {
      void fetch("/api/views/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // workbookName + projectName are required by the record schema (C4).
        body: JSON.stringify({ workbookSlug, viewSlug: tab.viewSlug, viewName: tab.viewName, workbookName, projectName }),
        credentials: "include",
      }).catch(() => {});
    },
    [workbookSlug, workbookName, projectName],
  );

  const onTab = useCallback(
    async (tab: ViewTab) => {
      if (tab.viewSlug === activeSlug) return;
      const href = hrefFor(tab.viewSlug);
      const res = await applyVizAction({ kind: "switchTab", sheetName: tab.viewName }, { origin: "user" });
      if (res.ok) {
        window.history.pushState(null, "", href);
        update({ activeSheet: tab.viewName });
        recordView(tab);
      } else {
        // Published without tabs (or switch rejected) → real navigation reloads the view.
        router.push(href);
      }
    },
    [activeSlug, hrefFor, applyVizAction, update, recordView, router],
  );

  // Back/Forward: re-activate the sheet the URL now points at (pushState doesn't
  // fire popstate, so this only runs for real history navigation).
  useEffect(() => {
    const onPop = () => {
      const slug = window.location.pathname.split("/").filter(Boolean).pop() ?? "";
      const tab = tabs.find((x) => x.viewSlug === slug);
      if (!tab) return;
      void applyVizAction({ kind: "switchTab", sheetName: tab.viewName }, { origin: "user" }).then((r) => {
        if (r.ok) update({ activeSheet: tab.viewName });
        else router.replace(window.location.pathname); // already at this URL via back/forward
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [tabs, applyVizAction, update, router]);

  if (tabs.length <= 1) return null;

  // Roving-focus arrow-key navigation across the tablist (WAI-ARIA tabs, FX-12).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const idx = btns.findIndex((b) => b === document.activeElement);
    if (idx < 0) return;
    const n = btns.length;
    const next = e.key === "ArrowRight" ? (idx + 1) % n : (idx - 1 + n) % n;
    btns[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={t("view.viewsTablist")}
      onKeyDown={onKeyDown}
      className="flex items-center gap-1 overflow-x-auto rounded-lg border border-sf-neutral-3 bg-white p-1 shadow-elev-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const active = tab.viewSlug === activeSlug;
        return (
          <button
            key={tab.viewSlug}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => void onTab(tab)}
            className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-caption font-medium transition-all duration-base ease-smooth ${
              active
                ? "bg-brand text-brand-on shadow-elev-1"
                : "text-sf-neutral-7 hover:bg-sf-neutral-2 hover:text-sf-neutral-9"
            }`}
          >
            {tab.viewName}
          </button>
        );
      })}
    </div>
  );
}
