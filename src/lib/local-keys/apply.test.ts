import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { removeKey, saveKey, testKey, type KeyDeps } from "@/lib/local-keys/apply";
import { localKeysEnabled } from "@/lib/local-keys/gate";
import { describeKeys } from "@/lib/local-keys/status";

let dir: string;
let env: Record<string, string | undefined>;
const SECRET = "apify_api_SECRET9876";

const deps = (over: Partial<KeyDeps> = {}): KeyDeps => ({ dir, env, workspaceSlug: "ornek-hesap", ...over });
const file = () => path.join(dir, ".env.local");

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-keys-"));
  env = {};
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("gate", () => {
  it("VERCEL varken ya da yönetici modu kapalıyken kapalı", () => {
    expect(localKeysEnabled({})).toBe(true);
    expect(localKeysEnabled({ VERCEL: "1" })).toBe(false);
    expect(localKeysEnabled({ OPERATOR_MODE: "off" })).toBe(false);
  });
});

describe("saveKey", () => {
  it("dosyaya yazar (0600), diğer satırlar kalır, çalışan ortam güncellenir, sonuç değeri içermez", () => {
    fs.writeFileSync(file(), "# not\nA=1\n", { mode: 0o644 });
    const result = saveKey("apify", SECRET, deps());
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(fs.readFileSync(file(), "utf8")).toBe(`# not\nA=1\nAPIFY_TOKEN=${SECRET}\n`);
    expect(fs.statSync(file()).mode & 0o777).toBe(0o600);
    expect(env.APIFY_TOKEN).toBe(SECRET);
    expect(fs.readdirSync(dir)).toEqual([".env.local"]); // geçici dosya kalmaz
  });

  it("dosya yoksa 0600 ile kurar; hesaba özel adlar slug'dan çözülür", () => {
    expect(saveKey("zernio", "zk_0123456789", deps()).ok).toBe(true);
    expect(saveKey("elevenlabs", "el_0123456789", deps()).ok).toBe(true);
    expect(fs.readFileSync(file(), "utf8")).toBe("ZERNIO_API_KEY_ORNEK_HESAP=zk_0123456789\nELEVENLABS_API_KEY_ORNEK_HESAP=el_0123456789\n");
    expect(fs.statSync(file()).mode & 0o777).toBe(0o600);
  });

  it("bozucu karakterde invalid_input, dosyaya dokunmaz", () => {
    fs.writeFileSync(file(), "A=1\n");
    const result = saveKey("apify", "abc=def\nX=1", deps());
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(fs.readFileSync(file(), "utf8")).toBe("A=1\n");
    expect(env.APIFY_TOKEN).toBeUndefined();
  });

  it("kapalıyken invalid_state ve dosya oluşmaz", () => {
    const result = saveKey("apify", SECRET, deps({ env: { VERCEL: "1" } }));
    expect(result).toMatchObject({ ok: false, code: "invalid_state" });
    expect(fs.existsSync(file())).toBe(false);
  });

  it("hesapta tanımsız servis (slug yok / stüdyoda yok) not_found", () => {
    expect(saveKey("zernio", "zk_0123456789", deps({ workspaceSlug: undefined }))).toMatchObject({ ok: false, code: "not_found" });
    expect(saveKey("elevenlabs", "el_0123456789", deps({ workspaceSlug: "bilinmeyen" }))).toMatchObject({ ok: false, code: "not_found" });
    expect(fs.existsSync(file())).toBe(false);
  });
});

describe("removeKey", () => {
  it("satırı ve ortam değişkenini kaldırır", () => {
    fs.writeFileSync(file(), `A=1\nAPIFY_TOKEN=${SECRET}\n`);
    env.APIFY_TOKEN = SECRET;
    expect(removeKey("apify", deps()).ok).toBe(true);
    expect(fs.readFileSync(file(), "utf8")).toBe("A=1\n");
    expect(env.APIFY_TOKEN).toBeUndefined();
  });
  it("kapalıyken dokunmaz", () => {
    fs.writeFileSync(file(), `APIFY_TOKEN=${SECRET}\n`);
    expect(removeKey("apify", deps({ env: { VERCEL: "1" } }))).toMatchObject({ ok: false, code: "invalid_state" });
    expect(fs.readFileSync(file(), "utf8")).toBe(`APIFY_TOKEN=${SECRET}\n`);
  });
});

describe("testKey (sahte ağ)", () => {
  const respond = (status: number) => vi.fn(async () => new Response("{}", { status }));

  it("Apify: ücretsiz users/me, Bearer; 200 → çalışıyor", async () => {
    env.APIFY_TOKEN = SECRET;
    const fetchImpl = respond(200);
    const result = await testKey("apify", deps({ fetchImpl }));
    expect(result).toEqual({ ok: true, message: "Anahtar çalışıyor." });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.apify.com/v2/users/me");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
  });

  it("ElevenLabs: GET /v1/user, xi-api-key; 401 → kabul edilmedi (iletide değer yok)", async () => {
    env.ELEVENLABS_API_KEY_ORNEK_HESAP = "el_SECRET12345";
    const fetchImpl = respond(401);
    const result = await testKey("elevenlabs", deps({ fetchImpl }));
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain("SECRET");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/user");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("el_SECRET12345");
  });

  it("Zernio: salt-okunur hesap listesi; yetkisiz → kabul edilmedi", async () => {
    env.ZERNIO_API_KEY_ORNEK_HESAP = "zk_SECRET12345";
    const ok = vi.fn(async () => new Response(JSON.stringify({ accounts: [] }), { status: 200 }));
    expect((await testKey("zernio", deps({ fetchImpl: ok }))).ok).toBe(true);
    const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/accounts$/);
    expect(init.method).toBe("GET");
    const denied = await testKey("zernio", deps({ fetchImpl: respond(401) }));
    expect(denied).toMatchObject({ ok: false, message: expect.stringContaining("kabul edilmedi") });
  });

  it("ağ hatası → ulaşılamadı; kayıt yoksa önce kaydet; kapalıyken ağa çıkmaz", async () => {
    env.APIFY_TOKEN = SECRET;
    const boom = vi.fn(async () => {
      throw new Error(`bağlantı koptu ${SECRET}`);
    });
    const failed = await testKey("apify", deps({ fetchImpl: boom }));
    expect(failed).toMatchObject({ ok: false, message: expect.stringContaining("ulaşılamadı") });
    expect(JSON.stringify(failed)).not.toContain("SECRET");
    env.APIFY_TOKEN = undefined;
    expect(await testKey("apify", deps({ fetchImpl: boom }))).toMatchObject({ ok: false, code: "not_found" });
    const never = vi.fn();
    env.APIFY_TOKEN = SECRET;
    env.VERCEL = "1";
    expect(await testKey("apify", deps({ fetchImpl: never }))).toMatchObject({ ok: false, code: "invalid_state" });
    expect(never).not.toHaveBeenCalled();
  });
});

describe("describeKeys", () => {
  it("yalnız son 4 haneyi verir; değer satırda yok; tanımsız servis çizilmez", () => {
    const rows = describeKeys("ornek-hesap", { APIFY_TOKEN: SECRET });
    expect(rows.map((r) => r.service)).toEqual(["apify", "zernio", "elevenlabs"]);
    expect(rows[0]).toMatchObject({ state: "set", last4: "9876" });
    expect(rows[1]).toMatchObject({ state: "missing" });
    expect(JSON.stringify(rows)).not.toContain("SECRET");
    expect(describeKeys(undefined, {}).map((r) => r.service)).toEqual(["apify"]);
  });
  it("genel Zernio anahtarı yalnız ornekstudyoapp için geçerlidir ve belirtilir", () => {
    const rows = describeKeys("ornekstudyoapp", { ZERNIO_API_KEY: "zk_genel_1234" });
    expect(rows.find((r) => r.service === "zernio")).toMatchObject({ state: "set", last4: "1234", generic: true });
    expect(describeKeys("ornek-hesap", { ZERNIO_API_KEY: "zk_genel_1234" }).find((r) => r.service === "zernio")?.state).toBe("missing");
  });
});
