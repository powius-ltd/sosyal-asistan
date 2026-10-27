-- panel — Ajan brifingi: Analist'in Genel bakış kartı ("Bugün bilmen gerekenler").
-- Şema ↔ domain eşlemesi: src/lib/domain/briefing.ts (`Briefing`, `BriefingItem`); yazan ve okuyan aynı zod şemalarını kullanır:
-- src/lib/data/briefing-schema.ts (`payload` ve `basis`). Yazan sunucu görevi `brief:now` (service role); okuma `getLatestBriefing`.
-- Gerçek veri taşıyan veritabanına `migration up` ile UYGULANIR (db reset YOK): yalnız eklemeli (yeni tablo); mevcut satırlara dokunmaz.

-- Her koşu YENİ satır yazar (geçmiş kalır); ekran en yenisini okur. Başarısız koşu satır YAZMAZ: ekranda önceki brifing kalır (bayat işaretli).
-- Render sırasında LLM çağrısı yok: payload'daki metin, sayıları yerleştirilmiş SON metindir.
create table public.agent_briefings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Üreten rol (`analyst`; ileride başka roller). Biçim denetimi (liste değil): yeni rol migration istemez.
  agent text not null check (agent ~ '^[a-z][a-z0-9_]{1,30}$'),
  generated_at timestamptz not null default now(),
  -- { schemaVersion, items: [{ kind, headline, body, evidence: ref[], action?, confidence }] } — zod: briefingPayloadSchema.
  -- Kanıt ref'leri `c:<id>`, `cell:<katman>:<açı>`, `plan:<hafta>`, `idea:<id>`, `due:<id>:d7`; bağlantı (href) render'da routes.ts'ten.
  -- 1–5 madde: boş brifing yazılmaz ("güçlü bir şey yok" de bir maddedir).
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload -> 'items') = 'array'
    and jsonb_array_length(payload -> 'items') between 1 and 5
  ),
  -- Dayanak: { analyzedCount, labeledCount, lastCollectedAt?, planWeek? } — zod: briefingBasisSchema. Bayatlık bunlarla birlikte yorumlanır.
  basis jsonb not null check (jsonb_typeof(basis) = 'object'),
  prompt_version text not null check (btrim(prompt_version) <> ''),
  persona_version text not null check (btrim(persona_version) <> ''),
  model text,
  -- Brifingi üreten koşu (abonelik çağrı sayacı); koşu silinirse satır kalır, run_id NULL olur (0011 deseni).
  run_id uuid,
  constraint agent_briefings_run_fkey foreign key (run_id, workspace_id)
    references public.collection_runs (id, workspace_id) on delete set null (run_id)
);
-- getLatestBriefing: workspace + rol için en yeni satır (tek sorgu).
create index agent_briefings_latest_idx on public.agent_briefings (workspace_id, agent, generated_at desc);
create index agent_briefings_run_idx on public.agent_briefings (run_id) where run_id is not null;
alter table public.agent_briefings enable row level security;

comment on table public.agent_briefings is 'Ajan brifingi (Analist): Genel bakış kartı için 1–5 maddelik, kanıt ref''li, sayıları kodla yerleştirilmiş metin. Her koşu yeni satır; ekran en yenisini okur.';

-- ── Yetki + RLS ────────────────────────────────────────────
-- 0006/0007/0008/0011 deseni: istemci rollerine varsayılan yetki kapalı; service role'e açıkça verilir. Üyeler okur, yazan yalnız sunucu.
grant all on public.agent_briefings to service_role;
grant select on public.agent_briefings to authenticated;

create policy "agent_briefings: üye okur" on public.agent_briefings
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
