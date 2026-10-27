import { Lightbulb, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ContentLink } from "@/components/common/content-link";
import { LiftBadge } from "@/components/common/lift-badge";
import { MeasuredValue } from "@/components/common/measured-value";
import { PlatformBadge } from "@/components/common/platform-badge";
import { StatCard } from "@/components/common/stat-card";
import { linkButtonClass } from "@/components/content/link-button";
import { formatSigned } from "@/components/notifications/digest-format";
import { Badge } from "@/components/ui/badge";
import type { ContentSummary } from "@/lib/domain/content-summary";
import { hookTypeLabel } from "@/lib/domain/hook-types";
import type { WeeklyDigest } from "@/lib/domain/notification";
import { formatCompact, formatNumber } from "@/lib/format";
import { DIGEST_PLAIN } from "@/lib/plain-language-account";
import { ROUTES } from "@/lib/routes";
import { truncateText } from "@/lib/text";

const TITLE_MAX = 70;

/** Özet bölümü: küçük büyük-harfsiz başlık + içerik (e-posta gövdesindeki bir blok). */
export function DigestSection({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function contentTitle(content: ContentSummary): string {
  return content.caption ? truncateText(content.caption, TITLE_MAX) : `@${content.ownerHandle} içeriği`;
}

/** Özetteki tek içerik satırı: lift + başlık bağlantısı + sahip/platform/hook türü + (varsa) izlenme. */
function DigestContentRow({ content, views }: { content: ContentSummary; views?: { value?: number } }) {
  return (
    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <LiftBadge lift={content.currentLift} className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <ContentLink id={content.contentItemId} externalUrl={content.url}>
          {contentTitle(content)}
        </ContentLink>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          @{content.ownerHandle}
          <PlatformBadge platform={content.platform} />
          {content.hookType ? <Badge variant="outline">{DIGEST_PLAIN.hookBadge(hookTypeLabel(content.hookType))}</Badge> : null}
        </span>
      </div>
      {views ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          <MeasuredValue value={views.value} format={formatCompact} reason="Bu içeriğin izlenmesi ölçülemedi." /> izlenme
        </span>
      ) : null}
    </li>
  );
}

const followersTone = (delta: number | undefined) => (delta === undefined || delta === 0 ? "default" : delta > 0 ? "positive" : "negative");

/** "Hesabın": takipçi değişimi + izlenme (ölçülemeyen tire + sebep) ve haftanın en iyi içerikleri. */
export function DigestOwn({ own, reasons }: { own: WeeklyDigest["own"]; reasons: WeeklyDigest["unmeasuredReasons"] }) {
  return (
    <>
      <DigestSection title="Hesabın" hint="Son 7 gün">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            label="Takipçi değişimi"
            tone={followersTone(own.followersDelta)}
            value={<MeasuredValue value={own.followersDelta} format={(n) => formatSigned(n)} reason={reasons.followersDelta} />}
            hint="Dönem sonu − dönem başı"
          />
          <StatCard
            label="Kazanılan izlenme"
            value={<MeasuredValue value={own.views} format={formatCompact} reason={reasons.views} />}
            hint="Kendi içeriklerinin toplamı"
          />
        </div>
      </DigestSection>
      <DigestSection title="En iyi içeriklerin" hint={DIGEST_PLAIN.topOwnHint}>
        {own.topContent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{DIGEST_PLAIN.noTopOwn}</p>
        ) : (
          <ul className="divide-y">
            {own.topContent.map((content) => (
              <DigestContentRow key={content.contentItemId} content={content} views={{ value: content.views }} />
            ))}
          </ul>
        )}
      </DigestSection>
    </>
  );
}

/** "Rakiplerde": yeni tutanlar (boşsa açıklayıcı boş durum) + en aktif rakip. */
export function DigestCompetitors({
  competitors,
  reasons,
}: {
  competitors: WeeklyDigest["competitors"];
  reasons: WeeklyDigest["unmeasuredReasons"];
}) {
  const { newOutliers, mostActive } = competitors;
  return (
    <DigestSection title="Rakiplerde" hint="İzlediğin rakipler, son 7 gün">
      {newOutliers.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            {DIGEST_PLAIN.noRivalOutlierTitle}
          </p>
          <p>{DIGEST_PLAIN.noRivalOutlierBody}</p>
          <Link href={ROUTES.discover} className={linkButtonClass("outline")}>
            Rakip keşfet
          </Link>
        </div>
      ) : (
        <ul className="divide-y">
          {newOutliers.map((content) => (
            <DigestContentRow key={content.contentItemId} content={content} />
          ))}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">
        En aktif rakip:{" "}
        {mostActive ? (
          <span className="font-medium text-foreground">
            @{mostActive.handle} · {formatNumber(mostActive.posts)} paylaşım
          </span>
        ) : (
          <>
            <MeasuredValue value={undefined} reason={reasons.mostActive} />{" "}
            <span>{reasons.mostActive ?? "Dönemde tarihli rakip içeriği yok."}</span>
          </>
        )}
      </p>
    </DigestSection>
  );
}

/** "Fikirler": dönemde oluşan fikir sayısı ve script'i hazır olanlar (sayaçlar, sıfır gerçek sıfırdır). */
export function DigestIdeas({ ideas }: { ideas: WeeklyDigest["ideas"] }) {
  return (
    <DigestSection title="Fikirler" hint="Son 7 gün">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Yeni fikir" value={formatNumber(ideas.new)} icon={<Lightbulb />} />
        <StatCard label="Script hazır" value={formatNumber(ideas.scripted)} hint="Güncellenen, script'i hazır ya da sonrası" />
      </div>
    </DigestSection>
  );
}
