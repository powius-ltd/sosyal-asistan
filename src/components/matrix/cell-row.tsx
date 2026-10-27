import type { ReactNode } from "react";

/** Haritadaki kutunun bir satırı (etiket + değerler); rakip, sen, açılış ve reklam satırları ortak kullanır. */
export function CellRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <dt className="w-12 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</dd>
    </div>
  );
}
