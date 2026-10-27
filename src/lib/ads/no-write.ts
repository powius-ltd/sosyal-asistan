/**
 * Reklam yazma yasağının tespit işlevi (saf): reklam kaynağında (`lib/ads/**`, `scripts/ads*`, `lib/job-runner/*ads*`) reklam hesabına yazan ya da
 * yazmaya götüren bir iz var mı. Panel v1'de reklam hesabına YAZMAZ (bütçe, durum, oluşturma, boost); bu tarayıcı o sözü kod düzeyinde tutar.
 * Desen parçaları birleştirilir ki bu dosyanın kendisi sınır grep'ine (yazan yöntem / uç araması) takılmasın.
 *
 * Kurallar: (1) yazan HTTP yöntemi, (2) yazan uç yolu, (3) bütçe ya da durum alt yolu, (4) `fetch(` çağrısı İSTEMCİ DOSYASI DIŞINDA
 * (tek ağ kapısı istemcidir; orada da yol izin listesiyle sınırlı), (5) yayın istemcisinin (yazan uçları olan) içe aktarılması.
 */
const WRITE_VERB = "(POST|PUT|PATCH|DELETE)";
const WRITE_PATH = "ads\\/(create|boost|status|bulk" + "-status)";
const SUB_PATH = "ads\\/[^\"'`]*\\/(" + "sta" + "tus|budget)";
const PUBLISH_CLIENT = "@/lib/zernio/" + "publish-client";
/** Tek ağ kapısı: yalnız bu dosyada `fetch(` olabilir. */
export const ADS_CLIENT_FILE = "providers/zernio/client.ts";

const PATTERNS: readonly { reason: string; pattern: RegExp; clientOnly?: true }[] = [
  { reason: "yazan HTTP yöntemi", pattern: new RegExp(`method\\s*:\\s*['"\`]${WRITE_VERB}['"\`]`, "i") },
  { reason: "yazan HTTP yöntemi (anahtar tırnaklı)", pattern: new RegExp(`['"]method['"]\\s*:\\s*['"\`]${WRITE_VERB}['"\`]`, "i") },
  { reason: "yazan uç yolu", pattern: new RegExp(WRITE_PATH, "i") },
  { reason: "bütçe/durum alt yolu", pattern: new RegExp(SUB_PATH, "i") },
  { reason: "yayın istemcisi içe aktarılmış", pattern: new RegExp(PUBLISH_CLIENT.replace(/[/@-]/g, "\\$&"), "i") },
  { reason: "istemci dışında fetch çağrısı", pattern: /\bfetch\s*\(/i, clientOnly: true },
];

export interface WriteFinding {
  line: number;
  reason: string;
  text: string;
}

/**
 * Kaynak metindeki yazma izlerini satır numarasıyla döndürür (boş = temiz). `file`: kaynağın yolu (`/` ayraçlı); istemci dosyasıysa
 * (`ADS_CLIENT_FILE` ile biter) `fetch(` kuralı uygulanmaz.
 */
export function findAdWrites(source: string, file?: string): WriteFinding[] {
  const isClient = file !== undefined && file.replace(/\\/g, "/").endsWith(ADS_CLIENT_FILE);
  const findings: WriteFinding[] = [];
  source.split("\n").forEach((text, index) => {
    for (const { reason, pattern, clientOnly } of PATTERNS) {
      if (clientOnly && isClient) continue;
      if (pattern.test(text)) findings.push({ line: index + 1, reason, text: text.trim() });
    }
  });
  return findings;
}
