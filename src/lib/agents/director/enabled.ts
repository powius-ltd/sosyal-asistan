/**
 * Yönetici ajan anahtarı: TEK okuma yeri. `AGENT_AUTO=on` ise iş bitince halka zinciri yerine ajan turu çalışır (`hook.ts`); başka her
 * değerde ve tanımsızken KAPALIDIR ve işçi bugünkü gibi davranır (`CYCLE_AUTO` ile aynı desen). `npm run ajan` ve sohbet emri anahtardan
 * bağımsızdır (kullanıcının elle verdiği emirdir); anahtar yalnız İŞÇİ KANCASINI açar.
 */
export const AGENT_AUTO_ENV = "AGENT_AUTO";

export function isAgentAuto(env: Record<string, string | undefined> = process.env): boolean {
  return env[AGENT_AUTO_ENV]?.trim().toLowerCase() === "on";
}
