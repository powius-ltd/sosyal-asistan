/**
 * Ekranın okuyabildiği TEK şey: her servis için "kayıtlı (son 4 hane)" ya da "yok". Değerin kendisi bu modülden dışarı çıkmaz.
 * Zernio'da hesaba özel anahtar yoksa ve genel anahtar bu hesaba geçerliyse (`pickZernioKey`) o durum ayrı söylenir.
 */
import { KEY_SERVICES, KEY_SERVICE_TEXT, keyEnvName, type KeyService } from "@/lib/local-keys/names";
import { pickZernioKey } from "@/lib/zernio/api-key";

type Env = Readonly<Record<string, string | undefined>>;

export interface KeyRow {
  service: KeyService;
  title: string;
  hint: string;
  state: "set" | "missing";
  /** Yalnız `state = "set"` iken: değerin son 4 karakteri. */
  last4?: string;
  /** Anahtar genel (hesaptan bağımsız) ayardan geliyor; buradan yazılan hesaba özel anahtar onun yerine geçer. */
  generic?: boolean;
}

export function describeKeys(workspaceSlug: string | undefined, env: Env = process.env): KeyRow[] {
  const rows: KeyRow[] = [];
  for (const service of KEY_SERVICES) {
    const name = keyEnvName(service, workspaceSlug);
    if (name === undefined) continue; // bu hesapta kullanılamayan servis çizilmez
    const text = KEY_SERVICE_TEXT[service];
    let value = env[name]?.trim();
    let generic = false;
    if (!value && service === "zernio") {
      const picked = pickZernioKey(workspaceSlug, env);
      if (picked) {
        value = picked.apiKey;
        generic = true;
      }
    }
    rows.push({ service, title: text.title, hint: text.hint, state: value ? "set" : "missing", ...(value ? { last4: value.slice(-4) } : {}), ...(generic ? { generic } : {}) });
  }
  return rows;
}
