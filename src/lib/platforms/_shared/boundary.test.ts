/**
 * Şasi sınırı (AGENTS.md): platform katmanında oturum/çerez ile ilgili hiçbir şey olmaz
 * (kendi hesap yalnız resmi API + OAuth; rakip yalnız herkese açık, oturumsuz veri).
 * Sınır grep'inin (`rg -i` ile oturum/çerez desenleri → 0 sonuç) test hâli; sözcükler bitişik yazılmaz ki bu dosya kendini yakalamasın.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PLATFORMS_DIR = fileURLToPath(new URL("..", import.meta.url));
const FORBIDDEN = new RegExp(["session" + "id", "coo" + "kie"].join("|"), "i");

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx|mts|json)$/.test(name)) yield full;
  }
}

describe("platform katmanı sınırı", () => {
  it("src/lib/platforms altında oturum/çerez sözcüğü geçmez", () => {
    const offenders = [...sourceFiles(PLATFORMS_DIR)].filter((file) => FORBIDDEN.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("fixture'larda Apify anahtarı ya da yorumcu alanı yok", () => {
    const fixtures = fileURLToPath(new URL("../../../../fixtures/apify/instagram", import.meta.url));
    // Anahtar öneki parçalı yazılır: "Apify anahtarı repoda yok" grep'i bu dosyayı da tarar.
    const forbidden = new RegExp(
      ["apify" + "_api_", '"latestComments"', '"firstComment"', '"taggedUsers"', '"coauthorProducers"', '"ownerId"', '"ownerFullName"'].join("|"),
    );
    const offenders = [...sourceFiles(fixtures)].filter((file) => forbidden.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
