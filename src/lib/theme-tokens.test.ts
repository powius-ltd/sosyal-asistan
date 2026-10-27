import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Koruyucu: renk yalnız belirteç dosyalarından (`src/app/tokens-light.css`, `tokens-dark.css`) yönetilir. Kod Tailwind palet sınıfı (ton numaralı), `white`/`black` renk
 * sınıfı, sabit hex ya da `oklch(`/`rgb(`/`hsl(` yazmaz; anlam belirteci yazar (`bg-warning-soft`, `text-success`).
 * Yeni anlam gerekiyorsa `:root` (`tokens-light.css`) + `.dark` (`tokens-dark.css`) + `@theme inline` (`app/theme.css`) üçlüsüne eklenir.
 * Tarama ham metindedir (yorumlar dahil): örnek sınıf adı yorumda da ton numarasıyla yazılmaz.
 */
const SRC = resolve(import.meta.dirname, "..");
/** Renk değerlerinin yaşadığı tek yer: aydınlık (`:root`) ve karanlık (`.dark`) belirteç dosyaları. */
const TOKENS_LIGHT = join(SRC, "app", "tokens-light.css");
const TOKENS_DARK = join(SRC, "app", "tokens-dark.css");
/**
 * Müşteri kopyasının (`PANEL_EDITION=kopya`) renk geçersiz kılmaları: yeni anlam açmaz, `:root` belirteçlerinin değerini
 * `[data-edition="kopya"]` altında ezer; renk değeri barındırabilen üçüncü ve son dosyadır (gerekçe: sürüm başına tek tema dosyası).
 */
const TOKENS_COPY = join(SRC, "app", "tokens-kopya.css");
const TOKEN_FILES = new Set([TOKENS_LIGHT, TOKENS_DARK, TOKENS_COPY]);
/** Tailwind eşlemesi: değer içermez, bu yüzden renk taramasından muaf DEĞİLDİR (yalnız belirteç dosyaları muaftır). */
const THEME_MAP = join(SRC, "app", "theme.css");
const SKIP_DIR = new Set(["node_modules", ".next"]);
const SKIP_FILE = /\.test\.tsx?$/;

/** Gerekçeli istisnalar (yol `src/` altında). Her biri hâlâ ihlal içermiyorsa test düşer: bayat istisna kalmaz. */
const EXCEPTIONS: Record<string, string> = {
  "components/ui/chart.tsx":
    "shadcn grafik sarmalayıcısı Recharts'ın VARSAYILAN öznitelik seçicilerini eşler ([stroke='#ccc'], [stroke='#fff']); uygulanan renk değil.",
};

const PALETTE =
  /\b(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/;
const WHITE_BLACK = /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|divide|shadow|accent|caret)-(?:white|black)\b/;
const COLOR_LITERAL = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:oklch|oklab|hsla?|rgba?)\(/;

/** Anlam belirteci sınıfı (örn. `bg-warning-soft`, `border-cell-weak-border/40`): yakalanan, `--color-` eksiz addır. */
const SEMANTIC_CLASS =
  /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|fill|stroke|ring|divide|outline|decoration)-((?:success|warning|danger|info|notice|highlight|plan|preparing|ready|publishing|expired|tier|platform|phase|cell|overlay|brand|ai|awaiting|approved|confidence|evidence|unmeasured|surface|attention|focus|nav|mascot|trend|bar|funnel|player)(?:-[a-z0-9]+)*|solid-foreground)(?![\w-])/g;

const normalize = (path: string): string => relative(SRC, path).replaceAll("\\", "/");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIR.has(entry.name) ? [] : sourceFiles(path);
    return /\.(?:tsx?|css)$/.test(entry.name) && !SKIP_FILE.test(entry.name) && !TOKEN_FILES.has(path) ? [path] : [];
  });
}

/** Satırdaki sabit renk ihlalleri (boş dizi = temiz). */
function colorViolations(line: string): string[] {
  return [PALETTE, WHITE_BLACK, COLOR_LITERAL].flatMap((pattern) => {
    const hit = pattern.exec(line);
    return hit ? [hit[0]] : [];
  });
}

function violationsOf(path: string): string[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .flatMap((line, index) => colorViolations(line).map((hit) => `${normalize(path)}:${index + 1}: ${hit}`));
}

// Değerler belirteç dosyalarında (`:root`, `.dark`), Tailwind eşlemesi (`@theme inline`) `theme.css`'te: birlikte okunur.
const css = [TOKENS_LIGHT, TOKENS_DARK, TOKENS_COPY, THEME_MAP].map((path) => readFileSync(path, "utf8").replaceAll("\r\n", "\n")).join("\n");
const block = (start: string): string => {
  const from = css.indexOf(start);
  return css.slice(from, css.indexOf("\n}\n", from));
};
const names = (text: string, pattern: RegExp): string[] => [...text.matchAll(pattern)].map((match) => match[1]);

const themeColors = names(block("@theme inline {"), /^\s+--color-([a-z0-9-]+):/gm);
const rootVars = names(block(":root {"), /^\s+--([a-z0-9-]+):/gm);
const darkVars = names(block(".dark {"), /^\s+--([a-z0-9-]+):/gm);

describe("renk belirteçleri", () => {
  it("kaynakta (globals.css hariç) palet sınıfı, white/black sınıfı ve sabit renk değeri yok", () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => !(normalize(path) in EXCEPTIONS))
      .flatMap(violationsOf);
    expect(offenders).toEqual([]);
  });

  it("istisna listesi bayat değil: her istisna dosyası hâlâ ihlal içeriyor", () => {
    for (const file of Object.keys(EXCEPTIONS)) expect(violationsOf(join(SRC, file)), file).not.toEqual([]);
  });

  it("kullanılan anlam belirteci sınıfı belirteç dosyalarında tanımlı (yazım hatası sessiz stilsiz kalmasın)", () => {
    const defined = new Set(themeColors);
    const unknown = sourceFiles(SRC)
      .filter((path) => /\.tsx?$/.test(path))
      .flatMap((path) =>
        [...readFileSync(path, "utf8").matchAll(SEMANTIC_CLASS)]
          .map((match) => match[1])
          .filter((name) => !defined.has(name))
          .map((name) => `${normalize(path)}: ${name}`),
      );
    expect(unknown).toEqual([]);
  });

  it("kopya geçersiz kılmaları yalnız :root'ta var olan belirteçleri ezer (yeni anlam açılmaz)", () => {
    const root = new Set(rootVars);
    const copyVars = names(block("[data-edition=\"kopya\"] {"), /^\s+--([a-z0-9-]+):/gm);
    expect(copyVars.length).toBeGreaterThan(20);
    expect(copyVars.filter((name) => !root.has(name))).toEqual([]);
  });

  it("belirteç dosyaları tutarlı: her @theme rengi :root'ta var, .dark yalnız :root'ta olanı geçersiz kılar", () => {
    const root = new Set(rootVars);
    expect(themeColors.filter((name) => !root.has(name))).toEqual([]);
    expect(darkVars.filter((name) => !root.has(name))).toEqual([]);
    expect(themeColors.length).toBeGreaterThan(40);
  });

  it("dedektör çalışıyor: palet, white/black ve sabit renk yakalanır; belirteç ve opaklık serbest", () => {
    // Örnekler parçalı kurulur: bu dosya kaynak taramasına ve `AGENTS.md` grep'ine takılmasın.
    const cls = (...parts: string[]): string => parts.join("-");
    expect(colorViolations(`className="${cls("bg", "amber", "100")} dark:${cls("text", "emerald", "300")}"`)).toEqual([cls("amber", "100")]);
    expect(colorViolations(`${cls("border", "rose", "500")}/40`)).toEqual([cls("rose", "500")]);
    expect(colorViolations(cls("text", "white"))).toEqual([cls("text", "white")]);
    expect(colorViolations(`${cls("bg", "black")}/10`)).toEqual([cls("bg", "black")]);
    expect(colorViolations(`const fill = "${"#"}fff";`)).toEqual(["#fff"]);
    expect(colorViolations(`color: "${"oklch"}(0.5 0.1 20)"`)).toEqual(["oklch("]);
    expect(colorViolations("bg-warning-soft text-success border-transparent &#123;")).toEqual([]);
  });

  it("tarayıcı gerçekten dosya buluyor (boş tarama sessizce geçmesin)", () => {
    const files = sourceFiles(SRC).map(normalize);
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain("components/common/lift-badge.tsx");
    expect(files).not.toContain("app/tokens-light.css");
    expect(files).not.toContain("app/tokens-dark.css");
    expect(files).not.toContain("app/tokens-kopya.css");
  });
});
