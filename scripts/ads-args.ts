/** `npm run ads` bayrak ayrıştırıcısı (saf; ağ ve DB yok). `--workspace` önceden `splitWorkspaceArg` ile ayıklanmıştır. */
export type AdsCommand =
  | { command: "accounts"; dryRun: boolean }
  | { command: "sync"; dryRun: boolean; days?: number }
  | {
      command: "link";
      dryRun: boolean;
      adAccount: string;
      currency?: string;
      zernioAccount?: string;
      /** Brüt marj (0 < m ≤ 1); `null` = marjı sil (`--margin=none`). Yalnız getiri hedefinde (`--goal=value`) anlamlı. */
      margin?: number | null;
      goal?: { kind: "value" | "cost"; resultLabel: string; target: number };
    };

export const ADS_USAGE = [
  "Kullanım:",
  "  npm run ads -- accounts [--dry-run] [--workspace=…]",
  "  npm run ads -- link --ad-account=act_… [--currency=TRY] [--zernio-account=…] [--goal=value|cost --result=<etiket> --target=<sayı>] [--margin=0.4|none] [--dry-run] [--workspace=…]",
  "  npm run ads -- sync [--days=35] [--dry-run] [--workspace=…]",
].join("\n");

const AD_ACCOUNT = /^act_\d{3,30}$/;

function flags(args: readonly string[]): Map<string, string | true> {
  const map = new Map<string, string | true>();
  for (const arg of args) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!m) throw new Error(`Bilinmeyen argüman: ${arg}`);
    if (map.has(m[1])) throw new Error(`--${m[1]} bir kez verilebilir.`);
    map.set(m[1], m[2] ?? true);
  }
  return map;
}

function allow(map: Map<string, unknown>, names: readonly string[]): void {
  for (const key of map.keys()) if (!names.includes(key)) throw new Error(`Bilinmeyen bayrak: --${key}`);
}

function value(map: Map<string, string | true>, name: string): string | undefined {
  const v = map.get(name);
  if (v === undefined) return undefined;
  if (v === true || v.trim() === "") throw new Error(`--${name} değer ister: --${name}=…`);
  return v.trim();
}

export function parseAdsArgs(argv: readonly string[]): AdsCommand {
  const [command, ...rest] = argv;
  const map = flags(rest);
  const dryRun = map.get("dry-run") === true;
  if (map.has("dry-run") && map.get("dry-run") !== true) throw new Error("--dry-run değer almaz.");
  if (command === "accounts") {
    allow(map, ["dry-run"]);
    return { command, dryRun };
  }
  if (command === "sync") {
    allow(map, ["dry-run", "days"]);
    const raw = value(map, "days");
    const days = raw === undefined ? undefined : Number(raw);
    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 90)) throw new Error("--days 1 ile 90 arasında tam sayı olmalı.");
    return { command, dryRun, ...(days === undefined ? {} : { days }) };
  }
  if (command === "link") {
    allow(map, ["dry-run", "ad-account", "currency", "zernio-account", "goal", "result", "target", "margin"]);
    const adAccount = value(map, "ad-account");
    if (adAccount === undefined || !AD_ACCOUNT.test(adAccount)) throw new Error("--ad-account=act_<sayı> ister.");
    const currency = value(map, "currency")?.toUpperCase();
    if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) throw new Error("--currency üç harfli ISO kodu olmalı (TRY, USD).");
    const goalKind = value(map, "goal");
    const resultLabel = value(map, "result");
    const targetRaw = value(map, "target");
    let goal: { kind: "value" | "cost"; resultLabel: string; target: number } | undefined;
    if (goalKind !== undefined || resultLabel !== undefined || targetRaw !== undefined) {
      if (goalKind !== "value" && goalKind !== "cost") throw new Error("--goal value ya da cost olmalı.");
      const target = Number(targetRaw);
      if (resultLabel === undefined || targetRaw === undefined || !Number.isFinite(target) || target <= 0) throw new Error("Hedef için --goal, --result=<etiket> ve --target=<pozitif sayı> birlikte gerekir.");
      goal = { kind: goalKind, resultLabel, target };
    }
    const marginRaw = value(map, "margin");
    let margin: number | null | undefined;
    if (marginRaw !== undefined) {
      margin = marginRaw.toLowerCase() === "none" ? null : Number(marginRaw);
      if (margin !== null && (!Number.isFinite(margin) || margin <= 0 || margin > 1)) throw new Error("--margin 0 ile 1 arasında olmalı (0.4 = %40) ya da --margin=none.");
      if (margin !== null && goal?.kind === "cost") throw new Error("--margin yalnız getiri hedefinde (--goal=value) olur; maliyet hedefinde marj tutulmaz.");
    }
    const zernioAccount = value(map, "zernio-account");
    return { command, dryRun, adAccount, ...(margin === undefined ? {} : { margin }), ...(currency === undefined ? {} : { currency }), ...(zernioAccount === undefined ? {} : { zernioAccount }), ...(goal === undefined ? {} : { goal }) };
  }
  throw new Error(command === undefined ? "Komut yok." : `Bilinmeyen komut: ${command}`);
}
