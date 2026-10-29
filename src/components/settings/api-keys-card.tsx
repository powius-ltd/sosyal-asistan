import { ApiKeyRow } from "@/components/settings/api-keys-row";
import { SettingsSection } from "@/components/settings/settings-section";
import type { KeyRow } from "@/lib/local-keys/status";

/**
 * "Anahtarlar" kartı: bu bilgisayardaki panelin dış hizmet anahtarlarını `.env.local` dosyasını elle düzenlemeden girer. Sayfa yalnız
 * yerelde ve yönetici modunda satır verir (`loadKeyRows`); satır yoksa kart çizilmez. Anahtar değeri ekrana hiç gelmez.
 */
export function ApiKeysCard({ rows }: { rows: KeyRow[] | undefined }) {
  if (!rows || rows.length === 0) return null;
  return (
    <SettingsSection
      title="Anahtarlar"
      description="Hizmetlerden aldığın anahtarı buraya yapıştır; bu bilgisayarda saklanır, ekranda bir daha gösterilmez. Yeni başlayan işlerde kullanılır."
    >
      <div className="flex flex-col divide-y">
        {rows.map((row) => (
          <ApiKeyRow key={row.service} {...row} />
        ))}
      </div>
    </SettingsSection>
  );
}
