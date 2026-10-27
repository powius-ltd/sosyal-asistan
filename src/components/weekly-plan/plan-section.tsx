import type { ReactNode } from "react";

/** Plan ekranının bölüm çerçevesi: başlık (h2) + kısa açıklama + içerik. */
export function PlanSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`plan-${id}`} className="flex flex-col gap-3">
      <div>
        <h2 id={`plan-${id}`} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {description ? <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Bölümde gösterilecek veri yokken (ya da ölçülemediğinde) sebebi yazan sade kutu. */
export function PlanNote({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}
