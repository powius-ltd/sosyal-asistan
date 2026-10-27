#!/usr/bin/env node
/**
 * Dosya boyutu kontrolü: src/** içinde 400 satırı aşan dosya varsa listeler ve exit 1 ile çıkar.
 * Kural: her dosya tek iş yapar, ≤ 400 satır (AGENTS.md "Kod düzeni").
 *
 * Kullanım: npm run check:size
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_LINES = 400;
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SRC = join(ROOT, "src");
const EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", ".css"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      yield* walk(full);
    } else if (EXTENSIONS.has(name.slice(name.lastIndexOf(".")))) {
      yield full;
    }
  }
}

function countLines(file) {
  const text = readFileSync(file, "utf8");
  if (text === "") return 0;
  const lines = text.split(/\r?\n/).length;
  return text.endsWith("\n") ? lines - 1 : lines;
}

const offenders = [];
let checked = 0;
for (const file of walk(SRC)) {
  // Üretilmiş dosyalar (ör. supabase tipleri) elle düzenlenmez; boyut kuralı onlara uygulanmaz.
  if (readFileSync(file, "utf8").startsWith("// @generated")) continue;
  checked += 1;
  const lines = countLines(file);
  if (lines > MAX_LINES) offenders.push({ file: relative(ROOT, file).replaceAll("\\", "/"), lines });
}

if (offenders.length > 0) {
  console.error(`check:size — ${offenders.length} dosya ${MAX_LINES} satırı aşıyor:`);
  for (const o of offenders.sort((a, b) => b.lines - a.lines)) {
    console.error(`  ${String(o.lines).padStart(5)}  ${o.file}`);
  }
  console.error("Önce anlamlı parçalara böl (ayrı commit), sonra ekle.");
  process.exit(1);
}

console.log(`check:size — tamam: ${checked} dosya, hepsi ≤ ${MAX_LINES} satır.`);
