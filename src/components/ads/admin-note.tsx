import { AD_SCREEN_COPY } from "@/lib/copy/ads";

/**
 * Yönetici notu: güncelleme DÜĞMESİ YOK (okuma ücreti netleşene kadar); yalnız düz metin komut ve son eşitleme zamanı. Sayfa zaten yalnız
 * yönetici modunda çizilir. Düğme sonra `JobCommand` (`ads_sync`) ile eklenir.
 */
export function AdminNote({ lastSync, showLink }: { lastSync?: string; showLink: boolean }) {
  const copy = AD_SCREEN_COPY.admin;
  return (
    <section data-slot="ad-admin" aria-label={copy.title} className="rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
      <h2 className="mb-1 font-medium text-foreground">{copy.title}</h2>
      <p>
        {copy.syncLead} <code className="rounded bg-muted px-1 py-0.5">{copy.syncCommand}</code>
      </p>
      {showLink ? (
        <p>
          {copy.linkLead} <code className="rounded bg-muted px-1 py-0.5">{copy.linkCommand}</code>
        </p>
      ) : null}
      <p>{copy.lastSync(lastSync)}</p>
    </section>
  );
}
