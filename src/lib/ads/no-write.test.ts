import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { findAdWrites } from "@/lib/ads/no-write";

const ADS_DIR = fileURLToPath(new URL(".", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
/** Tarayıcının kendisi ve bu test desen metni taşır; yasağı sınanan kaynak değildir. */
/** Çağrı adı parçalı yazılır: "ağ çağrısı yok" denetimi (rg) bu test metnini yanlışlıkla yakalamasın. */
const CALL = ["fe", "tch"].join("");
const SELF = new Set(["no-write.ts", "no-write.test.ts"]);
const SOURCE = /\.(ts|tsx|mts)$/;

function sourcesIn(dir: string, keep: (name: string) => boolean = () => true): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourcesIn(path, keep);
    return SOURCE.test(name) && !SELF.has(name) && keep(name) ? [path] : [];
  });
}

/** Tarama kapsamı: `lib/ads/**`, `scripts/ads*`, `lib/job-runner/*ads*`. */
function scanned(): string[] {
  const inDir = (dir: string, match: RegExp) => readdirSync(join(ROOT, dir)).filter((name) => match.test(name) && SOURCE.test(name)).map((name) => join(ROOT, dir, name));
  return [...sourcesIn(ADS_DIR), ...inDir("scripts", /^ads/), ...inDir("src/lib/job-runner", /ads/)];
}

describe("reklam hesabına yazma yok (v1: oku + öner)", () => {
  it("kapsamdaki kaynaklarda yazan yöntem, uç yolu, istemci dışı fetch ya da yayın istemcisi yok", () => {
    const files = scanned();
    expect(files.length, "taranan kaynak yok: yol yanlış").toBeGreaterThan(0);
    const names = files.map((file) => relative(ROOT, file));
    for (const must of ["src/lib/job-runner/outcome-map-ads.ts", "src/lib/ads/sync-job.ts", "src/lib/ads/providers/zernio/client.ts"]) expect(names, `kapsamda olmalı: ${must}`).toContain(must);
    const findings = files.flatMap((file) => findAdWrites(readFileSync(file, "utf8"), relative(ROOT, file)).map((f) => `${relative(ROOT, file)}:${f.line} ${f.reason}: ${f.text}`));
    expect(findings).toEqual([]);
  });

  it("tarayıcı yazan yöntemleri ve uçları yakalar, okuyan çağrıyı yakalamaz", () => {
    const verb = (v: string) => `${CALL}(url, { ${"method"}: "${v}" })`;
    for (const v of ["POST", "PUT", "PATCH", "DELETE", "post"]) expect(findAdWrites(verb(v), "x.ts").some((f) => f.reason.startsWith("yazan HTTP")), v).toBe(true);
    expect(findAdWrites(`x = { ${"method"}: 'DELETE' }`)).toHaveLength(1);
    expect(findAdWrites(`init = { "${"method"}": "PUT" }`)).toHaveLength(1);
    for (const path of ["create", "boost", "status", "bulk" + "-status"]) expect(findAdWrites(`const u = "/v1/ads/${path}"`), path).toHaveLength(1);
    expect(findAdWrites(`x = { ${"method"}: "GET" }`)).toEqual([]);
    expect(findAdWrites('const u = "/v1/ads/accounts"')).toEqual([]);
    expect(findAdWrites(`x = { ${"method"}: "POST" }\n// temiz satır\nx = { ${"method"}: "DELETE" }`).map((f) => f.line)).toEqual([1, 3]);
  });

  it("tarayıcı bütçe/durum alt yolunu yakalar", () => {
    for (const tail of ["sta" + "tus", "budget"]) {
      expect(findAdWrites(`const u = \`/v1/ads/\${id}/${tail}\``), tail).toHaveLength(1);
      expect(findAdWrites(`const u = "/v1/ads/abc/${tail}"`), tail).toHaveLength(1);
    }
    expect(findAdWrites('const u = "/v1/ads/insights"')).toEqual([]);
    expect(findAdWrites(`const a = "/v1/ads/tree"; const b = "/other/${"sta" + "tus"}"`)).toEqual([]);
  });

  it("fetch( yalnız istemci dosyasında serbest; başka yerde yakalanır", () => {
    const call = "const res = await fetch(url);";
    expect(findAdWrites(call, "src/lib/ads/providers/zernio/client.ts")).toEqual([]);
    expect(findAdWrites(call, "src/lib/ads/sync-job.ts").map((f) => f.reason)).toEqual(["istemci dışında fetch çağrısı"]);
    expect(findAdWrites(call).map((f) => f.reason)).toEqual(["istemci dışında fetch çağrısı"]);
    expect(findAdWrites("globalThis.fetch (url)", "scripts/ads.mts")).toHaveLength(1);
    // `fetch` türü ve `doFetch`/`fetchImpl` adları çağrı değildir.
    expect(findAdWrites("fetchImpl?: typeof fetch;\nconst doFetch = options.fetchImpl ?? fetch;", "src/lib/ads/sync-job.ts")).toEqual([]);
  });

  it("yayın istemcisi (yazan uçları olan) içe aktarılamaz", () => {
    const from = "@/lib/zernio/" + "publish-client";
    expect(findAdWrites(`import { createPublishClient } from "${from}";`, "scripts/ads.mts").map((f) => f.reason)).toEqual(["yayın istemcisi içe aktarılmış"]);
    expect(findAdWrites('import { createZernioClient } from "@/lib/zernio/client";', "scripts/ads.mts")).toEqual([]);
  });
});
