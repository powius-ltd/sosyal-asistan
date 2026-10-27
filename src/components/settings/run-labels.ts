/** Koşu tablosu için Türkçe etiketler ve durum renkleri. */
import type { RunKind, RunProvider, RunStatus } from "@/lib/domain/run";

export const RUN_PROVIDER_LABEL: Record<RunProvider, string> = {
  apify: "Apify",
  anthropic: "Claude",
  deepgram: "Deepgram",
  openai: "OpenAI",
  graph_api: "Meta API",
  claude_cli: "Claude (CLI)",
  gemini: "Gemini",
};

export const RUN_KIND_LABEL: Record<RunKind, string> = {
  profile: "Profil",
  content: "İçerik",
  discovery_related: "İlgili hesap keşfi",
  discovery_search: "Arama keşfi",
  llm_analysis: "İçerik analizi",
  llm_ideas: "Fikir üretimi",
  transcription: "Transkript",
  video_analysis: "Video analizi",
  llm_topic_screen: "Konu eleği",
  llm_voice_profile: "Ses profili",
  llm_topic_cluster: "Konu kümeleme",
  llm_week_synthesis: "Haftalık plan",
  llm_idea_generation: "Fikir + script üretimi",
  llm_angle_label: "Açı etiketleme",
  llm_briefing: "Brifing",
  llm_chat: "Sohbet yanıtı",
  llm_director: "Yönetici ajan turu",
};

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  reserved: "Rezerve",
  running: "Çalışıyor",
  succeeded: "Tamamlandı",
  ingested: "İşlendi",
  failed: "Başarısız",
  aborted: "İptal",
  timed_out: "Zaman aşımı",
};

export const RUN_STATUS_STYLE: Record<RunStatus, string> = {
  reserved: "bg-muted text-muted-foreground",
  running: "bg-info-soft text-info-soft-foreground",
  succeeded: "bg-ready-soft text-ready-soft-foreground",
  ingested: "bg-success-soft text-success-soft-foreground",
  failed: "bg-danger-soft text-danger-soft-foreground",
  aborted: "bg-muted text-muted-foreground",
  timed_out: "bg-expired-soft text-expired-soft-foreground",
};
