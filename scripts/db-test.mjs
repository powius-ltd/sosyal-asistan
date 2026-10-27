#!/usr/bin/env node
/**
 * Veritabanı testleri (düz SQL; pgTAP gerekmez): supabase/tests/*.sql
 * `npm run db:test [süzgeç]` — önce lokal Supabase açık olmalı (`npm run db:start`) ve `npm run db:reset` yapılmış.
 *
 * Her test dosyası TEK transaction'da koşar: `begin` + ortak hazırlık (_helpers.sql, _fixture.sql) + test + `rollback`
 * (veritabanı temiz kalır; seed verisine dokunulmaz). Test dosyaları `begin/commit` YAZMAZ.
 * Başarı: `raise notice 'ok - …'` satırları listelenir; ilk hata (assert/exception) dosyayı durdurur ve
 * betik 1 koduyla çıkar. psql, veritabanı konteynerinde çalışır (`docker exec`), ana makinede psql gerekmez.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TESTS = join(ROOT, "supabase", "tests");
const filter = process.argv[2];

const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync(join(ROOT, "supabase", "config.toml"), "utf8"))?.[1];
if (!projectId) {
  console.error("db:test — supabase/config.toml içinde project_id bulunamadı.");
  process.exit(1);
}
const container = `supabase_db_${projectId}`;

const running = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", container], { encoding: "utf8" });
if (running.status !== 0 || running.stdout.trim() !== "true") {
  console.error(`db:test — ${container} çalışmıyor. Önce: npm run db:start`);
  process.exit(1);
}

// `_` ile başlayan dosyalar ortak hazırlıktır (yardımcılar, fixture); her test dosyasının başına eklenir.
const shared = readdirSync(TESTS)
  .filter((name) => name.endsWith(".sql") && name.startsWith("_"))
  .sort()
  .map((name) => readFileSync(join(TESTS, name), "utf8"))
  .join("\n");
if (!shared.includes("create schema tap")) {
  console.error("db:test — supabase/tests/_helpers.sql (tap yardımcıları) yok.");
  process.exit(1);
}

const files = readdirSync(TESTS)
  .filter((name) => name.endsWith(".sql") && !name.startsWith("_"))
  .filter((name) => !filter || name.includes(filter))
  .sort();
if (files.length === 0) {
  console.error("db:test — çalıştırılacak test dosyası yok.");
  process.exit(1);
}

let failed = 0;
for (const name of files) {
  const script = `begin;\n${shared}\n${readFileSync(join(TESTS, name), "utf8")}\nrollback;\n`;
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1"],
    { input: script, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  const notices = [...(result.stderr ?? "").matchAll(/NOTICE:\s+(.*)/g)].map((m) => m[1]);
  if (result.status === 0) {
    console.log(`PASS ${name} (${notices.length} kontrol)`);
    for (const n of notices) console.log(`   ${n}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
    for (const n of notices) console.error(`   ${n}`);
    const errors = (result.stderr ?? "").split("\n").filter((l) => !/NOTICE:/.test(l) && l.trim() !== "");
    console.error(errors.map((l) => `   ${l}`).join("\n"));
  }
}

if (failed > 0) {
  console.error(`db:test — ${failed}/${files.length} dosya BAŞARISIZ.`);
  process.exit(1);
}
console.log(`db:test — tamam: ${files.length} dosya geçti.`);
