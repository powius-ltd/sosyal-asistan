import { briefingAgeLabel } from "@/components/briefing/age-label";
import { BriefingFooter } from "@/components/briefing/briefing-footer";
import { BriefingNote, NOTE_KINDS } from "@/components/briefing/briefing-item";
import { AiByline } from "@/components/common/ai-surface";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobCommand } from "@/components/workspace/job-command";
import { BRIEFING_STALE_DAYS, briefingFreshness, type Briefing, type BriefingStaleReason } from "@/lib/domain/briefing";
import { PLAIN_TERMS } from "@/lib/plain-language";
import type { WorkspaceCommandRef } from "@/lib/workspace/command";

/** Kartta gösterilen en çok not sayısı. */
export const NOTES_LIMIT = 3;

/** Bayatlık rozetinin düz dili (birinci tekil: notlar benim). */
const STALE_TEXT: Record<BriefingStaleReason, string> = {
  new_data: PLAIN_TERMS.stale.say.replace(/^./u, (first) => first.toLocaleUpperCase("tr-TR")),
  too_old: `Notlarım ${BRIEFING_STALE_DAYS} günden eski; güncelleyeceğim`,
};

interface BriefingCardProps {
  /** `repo.getLatestBriefing(wsId)`; hiç brifing yoksa null. */
  briefing: Briefing | null;
  /** Kartın çalışma alanı (kimlik + slug): işler kapalıyken yedek kalan yönetici komutları `--workspace=<slug>` ile bunu taşır. */
  workspace: WorkspaceCommandRef;
  /** Maskot adı (`maskotName()`, sayfa/sunucu okur ve geçirir). */
  maskotName: string;
  /** İstekteki tek saat (`getPanelContext()`). */
  now: Date;
  /** Şimdiki son başarılı toplama (`latestSuccessfulCollectionAt`); bilinmiyorsa yalnız yaş kuralı uygulanır. */
  lastCollectedAt?: string;
  /** Workspace saat dilimi (yönetici altbilgisindeki son toplama zamanı). */
  timeZone?: string;
  /** Yönetici modu (`isOperatorMode()`): iş düğmeleri (notları güncelle, madde eylemi) ve "N analiz, M etiket" dayanağı yalnız bu durumda görünür. */
  operator?: boolean;
  /** Notların kapsamı ("Tüm hesapların için" / "@hesap · Instagram için"); notlar çalışma alanı bazlıdır, hesap süzgeci onları değiştirmez (D3-06). */
  scope?: string;
  className?: string;
}

/**
 * Genel bakış — "Notlar": Analist'in en son brifingi, müşteriye en çok 3 kısa not (başlık + tek cümle + güven ölçeği). Başlığın
 * altında künye (kim · ne zaman). Gövdenin kalanı ve kanıt "Neden?" içinde. `next_step`/`pending` maddeleri gösterilmez (Özet ve
 * plan kartı karşılıyor). Render'da LLM çağrısı ve sayı üretimi yok: metin DB'den hazır gelir. Bayatlık `briefingFreshness` ile
 * (rutinle aynı kural).
 */
export function BriefingCard({ briefing, workspace, maskotName, now, lastCollectedAt, timeZone, operator = false, scope, className }: BriefingCardProps) {
  const author = `${maskotName} diyor ki`;
  if (!briefing) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg">Notlar</CardTitle>
          {scope ? <CardDescription>{scope}</CardDescription> : null}
          <AiByline author={author} />
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Henüz notum yok"
            description="Hesabına baktıktan sonra notlarımı burada yazacağım."
            action={operator ? <JobCommand request={{ kind: "briefing" }} workspace={workspace} className="items-center" /> : undefined}
            className="py-6"
          />
        </CardContent>
      </Card>
    );
  }

  const freshness = briefingFreshness(briefing.generatedAt, { now, lastCollectedAt });
  const notes = briefing.items.filter((item) => NOTE_KINDS.includes(item.kind)).slice(0, NOTES_LIMIT);
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">Notlar</CardTitle>
        {scope ? <CardDescription>{scope}</CardDescription> : null}
        <AiByline author={author} when={briefingAgeLabel(briefing.generatedAt, now)}>
          {freshness.stale ? (
            <Badge
              variant="outline"
              className="h-auto max-w-full border-notice-badge-border bg-notice py-0.5 whitespace-normal text-warning-soft-foreground"
              data-stale={freshness.reason}
            >
              {STALE_TEXT[freshness.reason]}
            </Badge>
          ) : null}
        </AiByline>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bugün için ayrı bir notum yok.</p>
        ) : (
          // Kart içinde kutu yok: notlar ince çizgiyle ayrılan satırlardır.
          <ol className="flex flex-col divide-y" aria-label="Notlar">
            {notes.map((item, index) => (
              <BriefingNote key={`${index}-${item.headline}`} item={item} workspace={workspace} operator={operator} />
            ))}
          </ol>
        )}
        {operator ? <BriefingFooter briefing={briefing} workspace={workspace} now={now} timeZone={timeZone} /> : null}
      </CardContent>
    </Card>
  );
}
