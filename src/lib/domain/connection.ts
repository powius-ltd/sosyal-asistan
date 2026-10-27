/**
 * Ayarlar ekranı için bağlantı durumu: kendi hesapların bağlantısı + entegrasyon
 * anahtarlarının (env) var/yok bilgisi. Anahtar DEĞERLERİ asla buraya girmez —
 * yalnız adı ve "tanımlı mı" bilgisi.
 */
import type { OwnAccount } from "@/lib/domain/competitor";

export type IntegrationKey = "supabase" | "apify" | "anthropic" | "meta" | "cron" | "gemini_agy" | "claude_cli";

export interface EnvVarStatus {
  /** Ör. "APIFY_TOKEN". */
  name: string;
  present: boolean;
}

export interface IntegrationStatus {
  key: IntegrationKey;
  label: string;
  /**
   * Gerekli tüm env değişkenleri tanımlı mı. `optional` entegrasyonda (yerel CLI araçları) değişkenlerin hiçbiri zorunlu
   * değildir: en az biri tanımlıysa true. CLI'nin kurulu olup olmadığı burada BİLİNMEZ (çalışma anında denetlenir).
   */
  configured: boolean;
  /** true: env değişkenleri isteğe bağlı (yoksa varsayılan/PATH kullanılır); `configured` false olsa da "eksik" değildir. */
  optional?: boolean;
  envVars: EnvVarStatus[];
  note?: string;
}

export interface Connections {
  accounts: OwnAccount[];
  integrations: IntegrationStatus[];
}
