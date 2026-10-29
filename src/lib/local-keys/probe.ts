/**
 * "Dene": kayıtlı anahtar çalışıyor mu? YALNIZ ücretsiz okuma uçları (Apify `users/me`, ElevenLabs `user`, Zernio hesap listesi);
 * ücretli çağrı yok. Yanıt gövdesi ve anahtar hiçbir yere dönmez: yalnız ok / kısa Türkçe sebep.
 */
import "server-only";

import type { KeyService } from "@/lib/local-keys/names";
import { createZernioClient, ZernioError } from "@/lib/zernio/client";

export type ProbeResult = { ok: true } | { ok: false; message: string };

const TIMEOUT_MS = 10_000;

function byStatus(status: number): ProbeResult {
  if (status >= 200 && status < 300) return { ok: true };
  if (status === 401 || status === 403) return { ok: false, message: "Anahtar kabul edilmedi. Doğru kopyaladığından emin ol." };
  if (status === 429) return { ok: false, message: "Hizmet şu an çok istek aldı. Biraz sonra tekrar dene." };
  return { ok: false, message: "Hizmet beklenmedik bir yanıt verdi. Biraz sonra tekrar dene." };
}

const UNREACHABLE: ProbeResult = { ok: false, message: "Hizmete ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene." };

export async function probeKey(service: KeyService, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<ProbeResult> {
  try {
    if (service === "zernio") {
      await createZernioClient({ apiKey, fetchImpl, maxRetries: 0 }).listAccounts();
      return { ok: true };
    }
    const request: { url: string; headers: Record<string, string> } =
      service === "apify"
        ? { url: "https://api.apify.com/v2/users/me", headers: { Authorization: `Bearer ${apiKey}` } }
        : { url: "https://api.elevenlabs.io/v1/user", headers: { "xi-api-key": apiKey } };
    const res = await fetchImpl(request.url, { method: "GET", headers: request.headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return byStatus(res.status);
  } catch (error) {
    if (error instanceof ZernioError && error.status !== undefined) return byStatus(error.status);
    return UNREACHABLE;
  }
}
