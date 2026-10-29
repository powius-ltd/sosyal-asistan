/**
 * Anahtar kaydet / kaldır / dene çekirdeği (action'ın arkasındaki mantık; bağımlılıklar enjekte edilir, testte geçici klasör + sahte ağ).
 * Sıra: kapı → ad çözümü (kapalı liste) → doğrulama → dosya (atomik) → çalışan sürecin ortamı. Değer hiçbir dönüşe girmez.
 */
import "server-only";

import { writeEnvValue } from "@/lib/local-keys/env-file";
import { validateKeyValue } from "@/lib/local-keys/env-text";
import { localKeysEnabled } from "@/lib/local-keys/gate";
import { keyEnvName, type KeyService } from "@/lib/local-keys/names";
import { probeKey } from "@/lib/local-keys/probe";
import { pickZernioKey } from "@/lib/zernio/api-key";

export type KeyOutcome = { ok: true; message: string } | { ok: false; code: "invalid_state" | "invalid_input" | "not_found" | "unknown"; message: string };

export interface KeyDeps {
  /** `.env.local` klasörü (proje kökü). */
  dir: string;
  /** Çalışan sürecin ortamı (yazımdan sonra güncellenir). */
  env: Record<string, string | undefined>;
  workspaceSlug: string | undefined;
  fetchImpl?: typeof fetch;
}

const CLOSED: KeyOutcome = { ok: false, code: "invalid_state", message: "Anahtarlar yalnız kendi bilgisayarında, yönetici modunda girilebilir." };

function resolveName(service: KeyService, deps: KeyDeps): string | undefined {
  return keyEnvName(service, deps.workspaceSlug);
}

const UNAVAILABLE: KeyOutcome = { ok: false, code: "not_found", message: "Bu hizmet bu hesap için tanımlı değil." };

export function saveKey(service: KeyService, rawValue: string, deps: KeyDeps): KeyOutcome {
  if (!localKeysEnabled(deps.env)) return CLOSED;
  const name = resolveName(service, deps);
  if (name === undefined) return UNAVAILABLE;
  const checked = validateKeyValue(rawValue);
  if (!checked.ok) return { ok: false, code: "invalid_input", message: checked.message };
  try {
    writeEnvValue(deps.dir, name, checked.value);
  } catch (error) {
    return { ok: false, code: "unknown", message: error instanceof Error ? error.message : "Anahtar kaydedilemedi." };
  }
  deps.env[name] = checked.value;
  return { ok: true, message: "Anahtar kaydedildi. Yeni işlerde kullanılır." };
}

export function removeKey(service: KeyService, deps: KeyDeps): KeyOutcome {
  if (!localKeysEnabled(deps.env)) return CLOSED;
  const name = resolveName(service, deps);
  if (name === undefined) return UNAVAILABLE;
  try {
    writeEnvValue(deps.dir, name, undefined);
  } catch (error) {
    return { ok: false, code: "unknown", message: error instanceof Error ? error.message : "Anahtar kaldırılamadı." };
  }
  delete deps.env[name];
  return { ok: true, message: "Anahtar kaldırıldı." };
}

export async function testKey(service: KeyService, deps: KeyDeps): Promise<KeyOutcome> {
  if (!localKeysEnabled(deps.env)) return CLOSED;
  const name = resolveName(service, deps);
  if (name === undefined) return UNAVAILABLE;
  // Zernio'da hesaba özel anahtar yoksa, bu hesaba geçerli genel anahtar denenir (işlerin kullandığı seçimle aynı).
  const value = (service === "zernio" ? pickZernioKey(deps.workspaceSlug, deps.env)?.apiKey : deps.env[name])?.trim();
  if (!value) return { ok: false, code: "not_found", message: "Önce anahtarı kaydet." };
  const result = await probeKey(service, value, deps.fetchImpl);
  return result.ok ? { ok: true, message: "Anahtar çalışıyor." } : { ok: false, code: "unknown", message: result.message };
}
