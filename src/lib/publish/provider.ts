/**
 * Yayın sağlayıcısı arayüzü: onaylı bir videoyu planlanan saatte zamanlar ve durumunu okur. Şimdilik tek uygulama Zernio'dur
 * (`zernio-provider.ts`); resmi Meta sağlayıcısı ileride aynı arayüzle gelir. Sağlayıcı ONAY vermez: onay `publish_jobs` satırındadır.
 */
import "server-only";
export interface ScheduleRequest {
  caption: string;
  /** Yüklenecek video (dosya adı + bayt). */
  file: { name: string; bytes: Uint8Array };
  /** Kapak karesi (videonun başından ms); fişte kapak yoksa 0. */
  thumbOffsetMs: number;
  /** Planlanan yayın anı (UTC). Her zaman gelecekte olmalı: geçmiş ya da boş saat çağıran tarafından reddedilir (`publishNow` yok). */
  scheduledAt: Date;
  /** Kendi hesabın kullanıcı adı (`@` olmadan): sağlayıcı hesabı buna göre seçer. */
  accountHandle: string;
}

export type ScheduleOutcome =
  | { kind: "scheduled"; postId: string }
  /** Aynı içerik zaten gönderilmiş (HTTP 409): önceki gönderi izlenir, İKİNCİ gönderim yapılmaz. */
  | { kind: "duplicate"; existingPostId?: string };

/** `unknown`: Zernio tanımadığımız bir durum döndü; satır `scheduled` gibi beklenir (başarısız sayılmaz), neden günlüğe yazılır. */
export type PollOutcome = { kind: "scheduled" } | { kind: "unknown"; status?: string } | { kind: "published"; permalink?: string } | { kind: "failed"; reason: string };

/** Sağlayıcı hata kodları (işin `last_error` başı). */
export type ProviderErrorCode = "zernio_account_missing" | "zernio_account_ambiguous" | "provider_error";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/**
 * `POST /posts` başladıktan sonraki hata: gönderinin Zernio'da oluşup oluşmadığı BİLİNMİYOR. Çağıran satırı `failed` yapmaz
 * (yeni satır ikinci gönderime yol açardı); `publishing`'te bırakır ve elle kontrol ister.
 */
export class PostOutcomeUnknownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostOutcomeUnknownError";
  }
}

export interface PublishProvider {
  schedule(request: ScheduleRequest): Promise<ScheduleOutcome>;
  poll(postId: string): Promise<PollOutcome>;
}
