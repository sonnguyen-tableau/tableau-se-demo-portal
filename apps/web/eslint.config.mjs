import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * DS-02 — design-token guardrails. Reject raw palette classes / hex / emoji in
 * `className` strings so components stay on the brand-token system. Matches both
 * string literals (`className="…"`) and template parts (`className={`…`}`), incl.
 * those inside cn()/ternaries (any Literal/TemplateElement under the attribute).
 * Severity is "warn" for now (DESIGN §2.2: flip to error once the remaining
 * surfaces land); admin/factory internal tools are allowlisted.
 */
function banInClassName(pattern, label) {
  const src = pattern.source;
  return [
    {
      selector: `JSXAttribute[name.name='className'] Literal[value=/${src}/]`,
      message: `DS-02: avoid ${label} in className — use brand/design tokens.`,
    },
    {
      selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=/${src}/]`,
      message: `DS-02: avoid ${label} in className — use brand/design tokens.`,
    },
  ];
}

const BANNED_CLASS = [
  ...banInClassName(/\b(slate|gray)-/, "slate-/gray-* (use sf-neutral-*)"),
  // Raw Tailwind blue-N only; sf-blue-* is a legit design token (excluded via lookbehind).
  ...banInClassName(/(?<!sf-)blue-[0-9]/, "raw Tailwind blue-N (use brand/sf tokens)"),
  ...banInClassName(/\btext-(xs|sm)\b/, "text-xs/text-sm (use text-caption/text-body-sm)"),
  ...banInClassName(/#[0-9a-fA-F]{3,6}\b/, "raw hex colors"),
  ...banInClassName(/[\uD83C-\uDBFF][\uDC00-\uDFFF]/, "emoji"),
  // Also catch BMP misc-symbols / dingbats (U+2600–27BF: ☀ ✦ ✈ ✓ …), which are
  // single code units and so slip past the surrogate-pair rule above (FX-14).
  ...banInClassName(/[☀-➿]/, "emoji (symbols)"),
];

const TEXT_WHITE = banInClassName(/\btext-white\b/, "text-white (sidebar/nav use --sidebar-text)");

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    ignores: ["**/admin/**", "**/factory/**"],
    rules: {
      "no-restricted-syntax": ["warn", ...BANNED_CLASS],
    },
  },
  {
    // The sidebar tree + nav must stay on --sidebar-text so they stay legible on
    // light-sidebar themes, so text-white is additionally banned here. Scoped to
    // the sidebar/nav chrome only — NOT every components/layout file (e.g. the
    // dark TenantHero legitimately uses text-white). Flat config replaces the
    // rule per-file, so this block repeats the base bans + adds text-white.
    files: [
      "components/nav/**/*.{ts,tsx}",
      "components/layout/Sidebar*.{ts,tsx}",
      "components/layout/MobileNavDrawer.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": ["warn", ...BANNED_CLASS, ...TEXT_WHITE],
    },
  },
];

export default eslintConfig;
