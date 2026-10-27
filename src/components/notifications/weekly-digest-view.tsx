import { Mail } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { linkButtonClass } from "@/components/content/link-button";
import { formatDigestPeriod } from "@/components/notifications/digest-format";
import { DigestPlan } from "@/components/notifications/digest-plan";
import { DigestCompetitors, DigestIdeas, DigestOwn } from "@/components/notifications/digest-sections";
import { hourLabel, weekdayName } from "@/lib/time";
import { Card } from "@/components/ui/card";
import type { AlertSettings, WeeklyDigest } from "@/lib/domain/notification";
import type { WeeklyPlanSummary } from "@/lib/domain/weekly-plan";
import { DIGEST_PLAIN, timeZonePlain } from "@/lib/plain-language-account";
import { ROUTES } from "@/lib/routes";

export interface WeeklyDigestViewProps {
  digest: WeeklyDigest;
  /** Gönderim zamanı ve alıcı satırı için (`repo.getAlertSettings`); sır içermez. */
  settings: AlertSettings;
  /** Workspace saat dilimi: dönem tarihleri ve gönderim saati bu dilimde. */
  timeZone: string;
  /** Bu haftanın planı (varsa): özette plana bağlantı bölümü çizilir; yoksa bölüm hiç çizilmez. */
  plan?: WeeklyPlanSummary;
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-12 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

function ScheduleNote({ settings, timeZone }: { settings: AlertSettings; timeZone: string }) {
  const { enabled, weekday, hour } = settings.weeklyDigest;
  return (
    <>
      <p>
        {enabled
          ? `Gönderim zamanı: her ${weekdayName(weekday) ?? "hafta"} ${hourLabel(hour)} (${timeZonePlain(timeZone)}).`
          : "Haftalık özet şu an kapalı."}{" "}
        {DIGEST_PLAIN.sendNote}
      </p>
      <Link href={ROUTES.settings} className={linkButtonClass("ghost", "xs")}>
        Uyarı ayarları
      </Link>
    </>
  );
}

/**
 * Haftalık özet, "e-postada böyle görünecek" önizlemesi: e-posta çerçevesi (konu/alıcı) + gövde bölümleri (hesap,
 * rakipler, fikirler, bu haftanın planı) + gönderim notu. Ölçülemeyen değer `MeasuredValue` ile (tire + sebep); sayaçlar gerçek sayıdır.
 */
export function WeeklyDigestView({ digest, settings, timeZone, plan }: WeeklyDigestViewProps) {
  const period = formatDigestPeriod(digest.periodStart, digest.periodEnd, timeZone);
  const email = settings.channels.email;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Mail className="size-3.5" aria-hidden />
        E-postada böyle görünecek
      </p>
      <Card className="gap-0 py-0" data-testid="weekly-digest">
        <dl className="flex flex-col gap-1 border-b bg-muted/40 px-5 py-3 text-sm">
          <Meta label="Konu">
            <span className="font-medium">Haftalık özet{period ? ` · ${period}` : ""}</span>
          </Meta>
          <Meta label="Kime">
            {email?.address ? email.address : <span className="text-muted-foreground">E-posta adresi tanımlı değil</span>}
          </Meta>
        </dl>
        <div className="flex flex-col gap-6 px-5 py-5">
          <DigestOwn own={digest.own} reasons={digest.unmeasuredReasons} />
          <DigestCompetitors competitors={digest.competitors} reasons={digest.unmeasuredReasons} />
          <DigestIdeas ideas={digest.ideas} />
          <DigestPlan plan={plan} />
        </div>
        <div className="flex flex-col items-start gap-1 border-t bg-muted/40 px-5 py-3 text-xs text-muted-foreground">
          <ScheduleNote settings={settings} timeZone={timeZone} />
        </div>
      </Card>
    </div>
  );
}
