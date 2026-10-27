/**
 * Sohbet isteğinin kapı kontrolleri (SAF/Web API; Next ve LLM yok). Route handler'lar server action'lar gibi otomatik kaynak denetimi
 * YAPMAZ: başka bir siteden gelen "basit" bir POST abonelik çağrısı harcatabilirdi. Savunma katmanları:
 *  1. `Content-Type: application/json` zorunlu (başka siteden JSON gönderen istek CORS ön denetimine takılır; biz CORS izni vermeyiz);
 *  2. `Sec-Fetch-Site` varsa yalnız `same-origin`/`none`; `Origin` varsa adresin sunucusuyla (Host) aynı olmalı;
 *  3. gövde boyutu sınırı (bellek): `Content-Length` ve gerçek okunan bayt.
 */

/** Aynı kaynaktan mı (tarayıcı başlıklarına göre)? Başlık yoksa (curl, betik) 1. katman (Content-Type) korur. */
export function isSameOriginRequest(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return false;
  const origin = headers.get("origin");
  if (origin === null) return true;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host === null) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function isJsonRequest(headers: Headers): boolean {
  return /^application\/json\s*(?:;|$)/i.test(headers.get("content-type") ?? "");
}

/**
 * Gövdeyi en çok `maxBytes` bayt okur; aşarsa okumayı keser ve `undefined` döner (bellek şişmesin). UTF-8 olarak çözülür.
 */
export async function readBodyCapped(request: Request, maxBytes: number): Promise<string | undefined> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return undefined;
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
