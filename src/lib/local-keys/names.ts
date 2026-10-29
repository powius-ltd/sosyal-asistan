/**
 * Girilebilen anahtarların KAPALI listesi (girdiden serbest ortam değişkeni adı gelmez). Ad kuralları başka yerde TEK kez yazılıdır ve
 * burada yeniden kullanılır: Zernio `zernioKeyEnvName`, ses `studioVoiceKeyName` (+ panel→stüdyo eşlemesi `studioAccountOf`).
 */
import { studioVoiceKeyName } from "@/lib/studio-order/voice-key";
import { studioAccountOf } from "@/lib/studio-order/accounts";
import { zernioKeyEnvName } from "@/lib/zernio/api-key";

export const KEY_SERVICES = ["apify", "zernio", "elevenlabs"] as const;
export type KeyService = (typeof KEY_SERVICES)[number];

/** Genel (hesaptan bağımsız) anahtarın ortam değişkeni adı. */
export const APIFY_ENV_NAME = "APIFY_TOKEN";

export const KEY_SERVICE_TEXT: Record<KeyService, { title: string; hint: string }> = {
  apify: { title: "Rakip verisi (Apify)", hint: "Rakiplerin herkese açık videolarını toplamak için. Tüm hesaplar için geçerli." },
  zernio: { title: "Instagram yayını (Zernio)", hint: "Videoyu yayınlamak ve sayıları okumak için. Yalnız bu hesap için." },
  elevenlabs: { title: "Seslendirme (ElevenLabs)", hint: "Videoların sesini üretmek için. Yalnız bu hesap için." },
};

/** Servisin, verilen hesap için ortam değişkeni adı; o hesapta kullanılamıyorsa (slug yok, stüdyoda tanımsız) `undefined`. */
export function keyEnvName(service: KeyService, workspaceSlug: string | undefined): string | undefined {
  if (service === "apify") return APIFY_ENV_NAME;
  if (service === "zernio") return zernioKeyEnvName(workspaceSlug);
  try {
    return studioVoiceKeyName(studioAccountOf(workspaceSlug).studioSlug);
  } catch {
    return undefined;
  }
}
