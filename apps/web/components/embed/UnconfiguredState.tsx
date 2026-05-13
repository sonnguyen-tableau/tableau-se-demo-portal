import type { ReactElement } from "react";
import Link from "next/link";

interface Props {
  viewPath: string;
}

export function UnconfiguredState({ viewPath }: Props): ReactElement {
  return (
    <div className="rounded-lg border border-dashed border-[hsl(var(--border))] p-8">
      <h3 className="text-lg font-semibold">Tableau Cloud not configured yet</h3>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        This page would embed <code className="rounded bg-[hsl(var(--muted))] px-1">{viewPath}</code>{" "}
        once <code>.env.local</code> is filled in with a real Connected App.
      </p>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
        <li>
          Follow{" "}
          <Link className="underline" href="/docs/runbooks/tableau-cloud-setup">
            docs/runbooks/tableau-cloud-setup.md
          </Link>{" "}
          to provision a Tableau Cloud Connected App.
        </li>
        <li>
          Copy <code>apps/web/.env.example</code> to <code>apps/web/.env.local</code> and fill in the
          values.
        </li>
        <li>Restart the dev server.</li>
      </ol>
    </div>
  );
}
