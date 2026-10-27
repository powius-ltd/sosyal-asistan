/**
 * Halka zinciri anahtarı: TEK okuma yeri. `CYCLE_AUTO=on` ise iş bitince sıradaki adım kendiliğinden açılır (`advanceCycle`); başka her
 * değerde ve tanımsızken KAPALIDIR ve işçi bugünkü gibi davranır (kanca hiç çağrılmaz). `CREDITS_ENFORCED` ile aynı desen.
 * `npm run halka -- ilerlet` anahtardan bağımsızdır (kullanıcının elle çalıştırdığı komuttur); anahtar yalnız İŞÇİ KANCASINI açar.
 */
export const CYCLE_AUTO_ENV = "CYCLE_AUTO";

export function isCycleAuto(env: Record<string, string | undefined> = process.env): boolean {
  return env[CYCLE_AUTO_ENV]?.trim().toLowerCase() === "on";
}

/**
 * `halka -- ilerlet` gerçek (kuru olmayan) koşuda da anahtara bakar: `CYCLE_AUTO` kapalıyken zincir elle de iş açmaz. Reddetme nedeni
 * (Türkçe) döner; serbestse undefined. Kuru koşu hiçbir şey yazmadığından her zaman serbesttir.
 */
export function ilerletRefusal(env: Record<string, string | undefined>, dryRun: boolean): string | undefined {
  return dryRun || isCycleAuto(env) ? undefined : `${CYCLE_AUTO_ENV}=on değil: zincir kapalı, gerçek koşu iş açmaz. Önce --dry-run ile bakabilirsin.`;
}
