-- panel — zeka katmanı: transcript, içerik analizi, fikir kartı + kanıtı.
-- Şema ↔ domain eşlemesi: src/lib/domain/intel.ts. Enum'lar versiyonlu taksonomiden gelir (hook_type = text);
-- her etiket birebir kanıt alıntılıdır ve alıntı transcript'te aranarak doğrulanır (evidence_verified).

-- Aranabilir hook kütüphanesi için trigram indeksi (Supabase'de eklentiler `extensions` şemasında).
create extension if not exists pg_trgm with schema extensions;

-- ── Transcript ─────────────────────────────────────────────
-- Rakip transcript'i 90 gün sonra silinir (yalnız hook alıntısı + analiz kalır): expires_at = created_at + 90 gün,
-- purge_expired_transcripts() metni ve segmentleri boşaltır (satır kalır: "süresi doldu" gösterimi).
-- Kendi içeriğin transcript'i süresiz olabilir (expires_at NULL).
create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  content_item_id uuid not null,
  provider text not null check (provider in ('apify', 'openai', 'deepgram', 'gemini', 'manual', 'claude_cli')),
  language text check (language ~ '^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$'),
  text text,
  -- [{ "start": sn, "end": sn, "text": "..." }] (sağlayıcı verirse).
  segments jsonb check (segments is null or jsonb_typeof(segments) = 'array'),
  word_count integer not null default 0 check (word_count >= 0),
  -- Anlamlı = ≥ 8 kelime (müzik/sessiz değil); eşiği uygulama uygular, LLM parası harcanmadan önce.
  is_meaningful boolean not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint transcripts_content_unique unique (content_item_id),
  -- Metin yalnız süre dolumuyla kaybolabilir.
  constraint transcripts_text_only_expires check (text is not null or expires_at is not null),
  constraint transcripts_content_fkey foreign key (content_item_id, workspace_id)
    references public.content_items (id, workspace_id) on delete cascade
);
create index transcripts_expiry_idx on public.transcripts (expires_at) where text is not null and expires_at is not null;
create index transcripts_workspace_idx on public.transcripts (workspace_id);
alter table public.transcripts enable row level security;

-- Süresi dolan transcript'lerin metnini/segmentlerini boşaltır; boşaltılan satır sayısını döndürür.
-- p_now çağıranın tek saatidir. Yalnız service role çağırır (cron/tick).
create function public.purge_expired_transcripts(p_now timestamptz default now())
returns integer
language sql
set search_path = ''
as $$
  with purged as (
    update public.transcripts t
       set text = null, segments = null
     where t.expires_at <= p_now
       and (t.text is not null or t.segments is not null)
    returning 1
  )
  select count(*)::integer from purged;
$$;
revoke all on function public.purge_expired_transcripts(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_expired_transcripts(timestamptz) to service_role;

-- ── İçerik analizi ─────────────────────────────────────────
-- İçerik başına GÜNCEL analiz (yeni prompt/taksonomi sürümü üzerine yazılır). LLM yalnız eleme + etiketleme.
create table public.content_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  content_item_id uuid not null,
  status text not null check (status in ('ok', 'failed', 'insufficient_data')),
  -- status = failed ise sebep; insufficient_data ise neden yetersiz.
  failure_reason text,
  -- İlk cümle/hook: transcript'ten BİREBİR alıntı.
  hook_text text,
  hook_type text,
  hook_type_evidence text,
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  labels jsonb not null default '[]'::jsonb check (jsonb_typeof(labels) = 'array'),
  evidence_verified boolean not null default false,
  taxonomy_version text not null check (btrim(taxonomy_version) <> ''),
  prompt_version text not null check (btrim(prompt_version) <> ''),
  model text,
  -- foldTurkish(hook metni + hesap + tür etiketi): hook kütüphanesi araması (uygulama yazar, LIKE '%q%' → trigram).
  search_key text,
  created_at timestamptz not null default now(),
  constraint content_analyses_content_unique unique (content_item_id),
  -- Kanıtı doğrulanmış analiz yalnız başarılı analiz olabilir.
  constraint content_analyses_verified_needs_ok check (not evidence_verified or status = 'ok'),
  constraint content_analyses_content_fkey foreign key (content_item_id, workspace_id)
    references public.content_items (id, workspace_id) on delete cascade
);
create index content_analyses_search_trgm_idx on public.content_analyses using gin (search_key extensions.gin_trgm_ops);
-- Hook kütüphanesi: yalnız `ok` + doğrulanmış analizler.
create index content_analyses_library_idx on public.content_analyses (workspace_id, content_item_id)
  where status = 'ok' and evidence_verified;
create index content_analyses_hook_type_idx on public.content_analyses (workspace_id, hook_type)
  where status = 'ok' and evidence_verified and hook_type is not null;
alter table public.content_analyses enable row level security;

-- ── Fikir kartı ────────────────────────────────────────────
-- Yazan sunucu (üretim); kullanıcı yalnız durumu değiştirir. Geçiş kuralları (IDEA_TRANSITIONS) depo katmanında.
-- Bağlı yayın işi publish_jobs.idea_id'den okunur (döngüsel FK yok).
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  status text not null default 'new'
    check (status in ('new', 'saved', 'scripted', 'scheduled', 'published', 'dismissed')),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  -- "Neden bu?" — kısa gerekçe.
  rationale text not null default '',
  platform public.platform not null,
  format public.content_format not null,
  -- Ana hook türü (versiyonlu taksonomi anahtarı); çıkarılamadıysa NULL.
  hook_type text,
  -- string[] (3–5 hook önerisi) ve string[] (script taslağı; her madde bir sahne/adım).
  hooks jsonb not null default '[]'::jsonb check (jsonb_typeof(hooks) = 'array'),
  script_outline jsonb not null default '[]'::jsonb check (jsonb_typeof(script_outline) = 'array'),
  -- lift × yenilik × kendi başarılı içeriğe benzerlik; bileşenleri rank_inputs'ta.
  rank_score double precision not null default 0 check (rank_score > '-Infinity'::float8 and rank_score < 'Infinity'::float8),
  rank_inputs jsonb not null default '{}'::jsonb check (jsonb_typeof(rank_inputs) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ideas_tenant_key unique (id, workspace_id)
);
create index ideas_status_rank_idx on public.ideas (workspace_id, status, rank_score desc);
alter table public.ideas enable row level security;
create trigger ideas_set_updated_at before update on public.ideas
  for each row execute function private.set_updated_at();

-- Fikri destekleyen kanıt videolar (≥ 2 olmalı: uygulama kuralı). Özet (sahip, alt yazı, güncel lift) okurken
-- content_items'tan türetilir; burada yalnız fikir üretildiği andaki lift saklanır.
create table public.idea_evidence (
  idea_id uuid not null,
  content_item_id uuid not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  lift_at_creation double precision not null
    check (lift_at_creation >= 0 and lift_at_creation < 'Infinity'::float8),
  created_at timestamptz not null default now(),
  primary key (idea_id, content_item_id),
  constraint idea_evidence_idea_fkey foreign key (idea_id, workspace_id)
    references public.ideas (id, workspace_id) on delete cascade,
  constraint idea_evidence_content_fkey foreign key (content_item_id, workspace_id)
    references public.content_items (id, workspace_id) on delete cascade
);
-- "Bu içerik hangi fikirlere kanıt?" + içerik silinirken FK araması.
create index idea_evidence_content_idx on public.idea_evidence (workspace_id, content_item_id);
alter table public.idea_evidence enable row level security;
