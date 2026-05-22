import type { ReactElement } from "react";
import Link from "next/link";

interface Props {
  viewPath: string;
}

export function UnconfiguredState({ viewPath }: Props): ReactElement {
  return (
    <div className="rounded-lg border border-dashed border-[hsl(var(--border))] p-8">
      <h3 className="text-lg font-semibold">Tableau Cloud chưa được cấu hình</h3>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        Trang này sẽ nhúng <code className="rounded bg-[hsl(var(--muted))] px-1">{viewPath}</code>{" "}
        sau khi điền đầy đủ thông tin Connected App vào <code>.env.local</code>.
      </p>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
        <li>
          Xem hướng dẫn tại{" "}
          <Link className="underline" href="/docs/runbooks/tableau-cloud-setup">
            docs/runbooks/tableau-cloud-setup.md
          </Link>{" "}
          để tạo Tableau Cloud Connected App.
        </li>
        <li>
          Sao chép <code>apps/web/.env.example</code> thành <code>apps/web/.env.local</code> và điền các giá trị.
        </li>
        <li>Khởi động lại dev server.</li>
      </ol>
    </div>
  );
}
