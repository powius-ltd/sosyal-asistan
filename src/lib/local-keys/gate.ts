/**
 * Anahtar ekranının TEK kapısı: yalnız yerelde (VERCEL yok) VE yönetici modunda açıktır. Kart, action ve dosya yazımı bunu sorar;
 * kapalıyken kart çizilmez, action `invalid_state` döner ve `.env.local`'a dokunulmaz.
 */
import { isOperatorMode } from "@/lib/workspace/operator-mode";

type Env = Readonly<Record<string, string | undefined>>;

export function localKeysEnabled(env: Env = process.env): boolean {
  if (env.VERCEL?.trim()) return false;
  return isOperatorMode(env);
}
