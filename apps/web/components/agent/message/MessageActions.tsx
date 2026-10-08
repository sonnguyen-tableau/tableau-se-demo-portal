"use client";

import { useState } from "react";
import { Copy, Check, RotateCcw, ThumbsUp, ThumbsDown } from "lucide-react";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

/**
 * Per-message actions for an assistant reply (AG-07): Copy, Retry, 👍/👎. A 👎
 * reveals an optional one-line comment. The parent shows this on hover AND
 * focus-within (keyboard reachable). Feedback is delivered via onFeedback →
 * the hook's feedback() → /api/chat/feedback.
 */
export function MessageActions({
  content,
  onRetry,
  onFeedback,
  variant = "panel",
  locale = DEFAULT_LOCALE,
}: {
  content: string;
  onRetry: () => void;
  onFeedback: (rating: "up" | "down", comment?: string) => void;
  variant?: "panel" | "page";
  locale?: Locale;
}) {
  const t = translator(locale);
  const dark = variant === "page";
  const [copied, setCopied] = useState(false);
  const [rated, setRated] = useState<"up" | "down" | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");

  const btn = `flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
    dark ? "text-white/50 hover:bg-white/10 hover:text-white" : "text-sf-neutral-5 hover:bg-sf-neutral-2 hover:text-sf-neutral-9"
  }`;
  const active = dark ? "text-sf-blue-40" : "text-brand-text";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={copied ? t("agent.copied") : t("agent.copy")}
          title={copied ? t("agent.copied") : t("agent.copy")}
          onClick={() => {
            void navigator.clipboard?.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className={btn}
        >
          {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />}
        </button>
        <button type="button" aria-label={t("agent.retry")} title={t("agent.retry")} onClick={onRetry} className={btn}>
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t("agent.helpful")}
          title={t("agent.helpful")}
          aria-pressed={rated === "up"}
          onClick={() => {
            setRated("up");
            setShowComment(false);
            onFeedback("up");
          }}
          className={`${btn} ${rated === "up" ? active : ""}`}
        >
          <ThumbsUp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t("agent.notHelpful")}
          title={t("agent.notHelpful")}
          aria-pressed={rated === "down"}
          onClick={() => {
            setRated("down");
            setShowComment(true);
            onFeedback("down"); // record immediately (symmetric with 👍); comment is optional enrichment
          }}
          className={`${btn} ${rated === "down" ? active : ""}`}
        >
          <ThumbsDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {showComment && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // The down-vote is already recorded on click; only send the comment
            // as enrichment when the user actually typed one (no duplicate vote).
            const c = comment.trim();
            if (c) onFeedback("down", c);
            setShowComment(false);
          }}
          className="flex items-center gap-1"
        >
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            aria-label={t("agent.feedbackPlaceholder")}
            placeholder={t("agent.feedbackPlaceholder")}
            className={`h-7 flex-1 rounded-md border px-2 text-caption outline-none ${
              dark
                ? "border-white/10 bg-white/[0.06] text-white placeholder:text-white/40"
                : "border-sf-neutral-3 bg-white text-sf-neutral-9 placeholder:text-sf-neutral-5"
            }`}
          />
          <button
            type="submit"
            className="h-7 shrink-0 rounded-md bg-brand px-2.5 text-caption font-semibold text-brand-on"
          >
            {t("agent.feedbackSend")}
          </button>
        </form>
      )}
    </div>
  );
}
