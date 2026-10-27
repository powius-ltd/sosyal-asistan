import { REPORT_COPY } from "@/lib/copy/report";

/** Seçilen haftada plan yokken rapor yerine çizilir (sayfa yine 200 döner, araç çubuğu geri dönüş sağlar). */
export function ReportEmpty() {
  return (
    <div className="mx-auto w-full max-w-[210mm] rounded-xl border bg-card px-8 py-12 text-card-foreground">
      <h1 className="font-heading text-2xl font-medium tracking-tight">{REPORT_COPY.emptyTitle}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{REPORT_COPY.emptyBody}</p>
    </div>
  );
}
