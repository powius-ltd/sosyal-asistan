-- panel — Faz 2: konu eleği sonucu (içerik başına "niş içi mi?").
-- Şema ↔ domain eşlemesi: src/lib/domain/intel.ts `ContentTopicScreen`; yazan `lib/llm` `screen-topics` görevi (sunucu, service role).
-- Gerçek veri taşıyan veritabanına `migration up` ile UYGULANIR (db reset YOK): yalnız eklemeli (yeni tablo); mevcut satırlara dokunmaz.

-- İçerik başına GÜNCEL eleme sonucu (yeniden eleme üzerine yazar). Niş dışı (in_niche = false) içerik karşılaştırma/plan
-- gruplarına girmez: ondan "tutan yön" öğrenilmez (views/insights `offNicheContentIds`, lib/insights `offNicheContentIds`).
-- Metni olmayan içerik (açıklama ve transcript boş) elenemez → satır YAZILMAZ: satırın yokluğu "elenmedi" demektir,
-- "niş içi" demek değildir (karar verilemez ≠ niş içi).
create table public.content_topic_screens (
  content_item_id uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  in_niche boolean not null,
  -- Kısa konu etiketi (LLM şeması ≤ 80); niş dışı içerikte de yazılır (konusu ne olduğu).
  topic text check (topic is null or char_length(btrim(topic)) between 1 and 80),
  -- Kararı veren somut sözleri gösteren tek cümle gerekçe.
  reason text check (reason is null or char_length(reason) <= 300),
  prompt_version text not null check (btrim(prompt_version) <> ''),
  model text,
  -- Elemeyi üreten koşu (abonelik çağrı sayacı); koşu silinirse satır kalır, run_id NULL olur.
  run_id uuid,
  screened_at timestamptz not null default now(),
  constraint content_topic_screens_content_fkey foreign key (content_item_id, workspace_id)
    references public.content_items (id, workspace_id) on delete cascade,
  constraint content_topic_screens_run_fkey foreign key (run_id, workspace_id)
    references public.collection_runs (id, workspace_id) on delete set null (run_id)
);
-- getInsights / plan taslağı: workspace'in niş dışı içerik kimlikleri (tek sorgu).
create index content_topic_screens_off_niche_idx on public.content_topic_screens (workspace_id, content_item_id) where not in_niche;
create index content_topic_screens_run_idx on public.content_topic_screens (run_id) where run_id is not null;
alter table public.content_topic_screens enable row level security;

comment on table public.content_topic_screens is 'Konu eleği (LLM): içerik başına niş içi/dışı + konu + gerekçe. Satır yok = elenmedi (niş içi sayılmaz).';

-- ── Yetki + RLS ────────────────────────────────────────────
-- 0006/0007 deseni: istemci rollerine varsayılan yetki kapalı; service role'e açıkça verilir. Üyeler okur, yazan yalnız sunucu.
grant all on public.content_topic_screens to service_role;
grant select on public.content_topic_screens to authenticated;

create policy "content_topic_screens: üye okur" on public.content_topic_screens
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
