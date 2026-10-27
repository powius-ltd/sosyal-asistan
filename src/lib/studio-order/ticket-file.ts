/** Fiş dosyası: metin ↔ doğrulanmış `Ticket`. Okuma sıkıdır (şema reddederse açık hata), yazma şemadan geçmeyen fişi yazmaz. */
import { parseFrontmatter, serializeFrontmatter, type YamlMap, type YamlValue } from "@/lib/studio-order/frontmatter";
import { ticketSchema, type Ticket } from "@/lib/studio-order/schema";

export interface ParsedTicket {
  ticket: Ticket;
  /** Serbest not (frontmatter sonrası). */
  note: string;
}

/** Fişteki alan sırası (SIPARIS.md tablosu). */
const KEY_ORDER = [
  "siparis_id", "fikir_id", "plan_hafta", "slot", "hesap", "mod", "tur", "sutun", "istenen_saat", "uretim_saati", "onay", "durum",
  "hedef", "hedef_sure_sn", "hedef_sure_gerekce", "cta", "kaynak_link", "konu", "ana_hat", "senaryo", "ornek_video",
  "video", "kapak", "hata_notu", "zernio_post_id", "yayin_url",
] as const;
/** Değeri henüz olmayan ama fişte görünmesi istenen alanlar (stüdyo yazar). */
const STUDIO_FIELDS = ["video", "kapak", "hata_notu"] as const;

export function readTicket(text: string): ParsedTicket {
  const { data, body } = parseFrontmatter(text);
  const parsed = ticketSchema.safeParse(data);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "(kök)"}: ${i.message}`).join("; ");
    throw new Error(`Fiş geçersiz: ${detail}`);
  }
  return { ticket: parsed.data, note: body.trim() };
}

function yamlOf(value: unknown): YamlValue | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value ? "evet" : "hayir";
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(String);
  const out: YamlMap = {};
  for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
    const converted = yamlOf(child);
    if (converted !== undefined) out[childKey] = converted;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

export function writeTicket(input: Ticket, note: string): string {
  const ticket = ticketSchema.parse(input);
  const data: YamlMap = {};
  const record = ticket as Record<string, unknown>;
  for (const key of KEY_ORDER) {
    const value = key === "ornek_video" ? ticket.ornek_video : record[key];
    const converted = yamlOf(value);
    if (converted !== undefined) data[key] = converted;
  }
  return serializeFrontmatter(data, note, STUDIO_FIELDS);
}
