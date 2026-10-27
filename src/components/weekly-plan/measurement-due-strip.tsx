import { Timer } from "lucide-react";

import { ContentLink } from "@/components/common/content-link";
import { JobCommand } from "@/components/workspace/job-command";
import { CHECKPOINT_LABEL, type MeasurementDue } from "@/lib/domain/outcomes";
import { TAP_LINKS } from "@/components/weekly-plan/tap-target";
import { DEFAULT_TIMEZONE, formatDate } from "@/lib/format";
import { MEASUREMENT_DUE_PLAIN } from "@/lib/plain-language-plan";

/** Şeritte tek tek yazılan en çok yayın (kalanı sayıyla anılır). */
const SHOWN = 4;

/**
 * "Ölçüm zamanı geldi" şeridi: ölçüm penceresi açık ama ölçümü olmayan kendi Reels'ler. Liste okuma anında hesaplanır
 * (`listMeasurementDue`, ücretsiz; Apify yok) ve render sırasında HİÇBİR ŞEY yazılmaz. Platform adı yazılmaz ("yayın"). Ölçümü yönetici "Sonuçları ölç" düğmesiyle
 * başlatır (para harcar: düğme önce tahmini gösteren onay penceresini açar); işler panelden başlatılamıyorsa yerine komut metni yedek
 * kalır. Müşteri görünümünde ne düğme ne komut vardır. Ölçülecek Reels yoksa şerit çizilmez.
 */
export function MeasurementDueStrip({ due }: { due: readonly MeasurementDue[] }) {
  if (due.length === 0) return null;
  const shown = due.slice(0, SHOWN);
  return (
    <section
      aria-label="Ölçüm zamanı geldi"
      className="mb-6 flex items-start gap-3 rounded-xl border border-notice-border bg-notice-quiet px-4 py-3 text-sm text-notice-foreground-strong"
    >
      <Timer className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p>
          <strong>{MEASUREMENT_DUE_PLAIN.headline(due.length)}</strong>
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {shown.map((item) => (
            <li key={`${item.contentItemId}:${item.day}`} className="flex items-center gap-1.5">
              <ContentLink id={item.contentItemId} externalUrl={item.url} className={TAP_LINKS}>
                {`@${item.ownerHandle}`}
              </ContentLink>
              <span>
                · {CHECKPOINT_LABEL[item.day]} · yayın {formatDate(item.publishedAt, DEFAULT_TIMEZONE) ?? "—"}
              </span>
            </li>
          ))}
          {due.length > shown.length ? <li>{MEASUREMENT_DUE_PLAIN.more(due.length - shown.length)}</li> : null}
        </ul>
        <JobCommand
          request={{ kind: "measure" }}
          lead="Ölçmek için terminalde:"
          note={<span>Önce tahmini tutarı yazar; aylık ölçüm tavanını Ayarlar&apos;da onaylamış olman gerekir.</span>}
        />
      </div>
    </section>
  );
}
