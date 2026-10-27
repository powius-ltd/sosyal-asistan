import { Link2 } from "lucide-react";

import { Hint } from "@/components/common/hint";
import { MeasuredValue } from "@/components/common/measured-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { OwnAccount, OwnAccountConnection } from "@/lib/domain/competitor";
import { PLATFORMS, PLATFORM_LABEL, type Platform } from "@/lib/domain/platform";
import { formatCompact, formatDate, formatDateTime } from "@/lib/format";
import { SETTINGS_PLAIN } from "@/lib/plain-language-account";
import { cn } from "@/lib/utils";

/**
 * Platform kartlarının yapılandırması. `connectable: false` = bağlantı henüz desteklenmiyor
 * ("yakında"). Faz 4'te TikTok/YouTube eklenince yalnız burası değişir; bileşen platforma göre dallanmaz.
 */
const PLATFORM_CARD: Record<Platform, { title: string; connectable: boolean }> = {
  instagram: { title: PLATFORM_LABEL.instagram, connectable: true },
  tiktok: { title: PLATFORM_LABEL.tiktok, connectable: false },
  youtube: { title: `${PLATFORM_LABEL.youtube} Shorts`, connectable: false },
};

const CONNECTION: Record<OwnAccountConnection, { label: string; style: string; hint: string }> = {
  connected: {
    label: "Bağlı",
    style: "bg-success-soft text-success-soft-foreground",
    hint: "Resmi API ile bağlı; analitik ve yayın kullanılabilir.",
  },
  scrape_only: {
    label: "Yalnız herkese açık veri",
    style: "bg-info-soft text-info-soft-foreground",
    hint: "Resmi API bağlantısı yok; yalnız herkese açık veri toplanır. Yayın ve gelişmiş analitik için bağlanmalı.",
  },
  expired: {
    label: "Süresi doldu",
    style: "bg-warning-soft text-warning-soft-foreground",
    hint: "Erişim izninin süresi doldu; yeniden bağlanmalı.",
  },
  revoked: {
    label: "Erişim geri alındı",
    style: "bg-danger-soft text-danger-soft-foreground",
    hint: "Erişimi hesap sahibi geri aldı; yeniden bağlanmalı.",
  },
};

function ConnectionBadge({ connection }: { connection: OwnAccountConnection }) {
  const info = CONNECTION[connection];
  return (
    <Hint content={info.hint} label={info.label}>
      <Badge variant="outline" className={cn("border-transparent", info.style)} data-connection={connection}>
        {info.label}
      </Badge>
    </Hint>
  );
}

function AccountRow({ account, timeZone }: { account: OwnAccount; timeZone: string }) {
  const tokenEnd = formatDate(account.tokenExpiresAt, timeZone);
  const synced = formatDateTime(account.lastSyncedAt, timeZone);

  return (
    <li className="flex flex-col gap-1 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="truncate font-medium">@{account.handle}</span>
        <ConnectionBadge connection={account.connection} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {account.displayName ? <span>{account.displayName}</span> : null}
        <span className="inline-flex items-center gap-1">
          <MeasuredValue value={account.followers} format={formatCompact} reason="Takipçi sayısı alınamadı." />
          takipçi
        </span>
        {tokenEnd ? <span>Erişim bitişi: {tokenEnd}</span> : null}
        {synced ? <span>Son eşitleme: {synced}</span> : null}
      </div>
    </li>
  );
}

/**
 * Platform bağlantı kartları. Bağlama (OAuth) henüz açık değil: düğme devre dışıdır ve nedeni görünür yazılır (hover ipucuna bırakılmaz).
 * Bağlı hesabı olan platformda düğme "Yeniden bağla"dır. "Faz" yazıları yalnız yönetici modunda (`operator`); müşteri "yakında" okur.
 */
export function ConnectionCards({ accounts, timeZone, operator = false }: { accounts: OwnAccount[]; timeZone: string; operator?: boolean }) {
  const notes = operator ? SETTINGS_PLAIN.connectNoteOperator : SETTINGS_PLAIN.connectNote;
  const disabledReason = operator ? SETTINGS_PLAIN.connectDisabledOperator : SETTINGS_PLAIN.connectDisabled;
  return (
    <section aria-labelledby="connections-title" className="flex flex-col gap-3">
      <div>
        <h2 id="connections-title" className="text-base font-medium">
          Hesap bağlantıları
        </h2>
        <p className="text-sm text-muted-foreground">
          Kendi hesapların yalnız resmi API ile bağlanır; şifre ya da çerez istenmez.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {PLATFORMS.map((platform) => {
          const card = PLATFORM_CARD[platform];
          const own = accounts.filter((a) => a.platform === platform);
          return (
            <Card key={platform} data-platform={platform}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {card.title}
                  {card.connectable ? null : <Badge variant="secondary">Yakında</Badge>}
                </CardTitle>
                <CardDescription>{notes[platform]}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-2">
                {own.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {own.map((account) => (
                      <AccountRow key={account.id} account={account} timeZone={timeZone} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Bu platformda kayıtlı hesap yok.</p>
                )}
              </CardContent>
              {card.connectable ? (
                <CardFooter className="flex-col items-start gap-2">
                  <Button variant="outline" size="sm" disabled aria-describedby={`connect-reason-${platform}`} className="min-h-tap md:min-h-0">
                    <Link2 data-icon="inline-start" aria-hidden />
                    {own.some((account) => account.connection === "connected") ? SETTINGS_PLAIN.reconnect : SETTINGS_PLAIN.connect}
                  </Button>
                  <p id={`connect-reason-${platform}`} className="text-xs text-muted-foreground">
                    {disabledReason}
                  </p>
                </CardFooter>
              ) : null}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
