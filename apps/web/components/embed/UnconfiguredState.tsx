import type { ReactElement } from "react";
import Link from "next/link";
import { translator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n-shared";

interface Props {
  viewPath: string;
  locale?: Locale;
}

export function UnconfiguredState({ viewPath, locale = DEFAULT_LOCALE }: Props): ReactElement {
  const t = translator(locale);
  return (
    <div className="rounded-lg border border-dashed border-[hsl(var(--border))] p-8">
      <h3 className="text-lg font-semibold">{t("unconfigured.title")}</h3>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        {t("unconfigured.bodyPrefix")}{" "}
        <code className="rounded bg-[hsl(var(--muted))] px-1">{viewPath}</code>{" "}
        {t("unconfigured.bodySuffix")}
      </p>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
        <li>
          {t("unconfigured.step1Prefix")}{" "}
          <Link className="underline" href="/docs/runbooks/tableau-cloud-setup">
            docs/runbooks/tableau-cloud-setup.md
          </Link>{" "}
          {t("unconfigured.step1Suffix")}
        </li>
        <li>{t("unconfigured.step2")}</li>
        <li>{t("unconfigured.step3")}</li>
      </ol>
    </div>
  );
}
