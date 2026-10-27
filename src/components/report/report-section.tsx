import type { ReactNode } from "react";

/** Rapor bölümü: başlık sayfa sonunda tek başına kalmaz (`break-after-avoid`). */
export function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7 first:mt-0">
      <h2 className="mb-2 border-b pb-1 font-heading text-[1.35rem] leading-snug font-medium break-after-avoid">{title}</h2>
      {children}
    </section>
  );
}
