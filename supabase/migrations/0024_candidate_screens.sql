-- panel — rakip bulma v2: aday niş eleği sonucu (rakip adayı başına güncel "niş uyumu").
-- Şema ↔ domain eşlemesi: src/lib/collection/candidate-screen-store.ts; yazan `lib/llm/screen-candidates` (sunucu, service role).
-- Gerçek veri taşıyan veritabanına `migration up` ile UYGULANIR (db reset YOK): yalnız eklemeli (yeni tablo); mevcut satırlara dokunmaz.

-- Aday başına tek GÜNCEL sonuç (yeniden eleme üzerine yazar; 0008 `content_topic_screens` deseni). Satır yok = elenmedi
-- (niş uyumu bilinmiyor: sıralamada nötr; `fit = 'unsure'` ile aynı davranır ama "hiç bakılmadı" bilgisini korur).
create table public.competitor_screens (
  competitor_id uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform public.platform not null,
  -- fit: nişe uyuyor · off: açıkça başka konu · unsure: metin yetmedi ya da alıntı doğrulanamadı.
  fit text not null check (fit in ('fit', 'off', 'unsure')),
  -- Kararı veren somut sözleri gösteren tek cümle gerekçe.
  reason text check (reason is null or char_length(reason) <= 300),
  -- Adayın biyografi / açıklamasından BİREBİR alıntı (kanıt denetiminden geçmiş); doğrulanamayan karar `unsure` yazılır.
  quote text check (quote is null or char_length(quote) <= 300),
  prompt_version text not null check (btrim(prompt_version) <> ''),
  model text,
  -- Elemeyi üreten koşu (abonelik çağrı sayacı); koşu silinirse satır kalır, run_id NULL olur.
  run_id uuid,
  screened_at timestamptz not null default now(),
  constraint competitor_screens_competitor_fkey foreign key (competitor_id, workspace_id, platform)
    references public.competitors (id, workspace_id, platform) on delete cascade,
  constraint competitor_screens_run_fkey foreign key (run_id, workspace_id)
    references public.collection_runs (id, workspace_id) on delete set null (run_id)
);
create index competitor_screens_workspace_idx on public.competitor_screens (workspace_id, fit);
create index competitor_screens_run_idx on public.competitor_screens (run_id) where run_id is not null;
alter table public.competitor_screens enable row level security;

comment on table public.competitor_screens is 'Aday niş eleği (LLM): rakip adayı başına fit/off/unsure + gerekçe + birebir alıntı. Satır yok = elenmedi.';

-- ── Yetki + RLS ────────────────────────────────────────────
-- 0008 deseni: istemci rollerine varsayılan yetki kapalı; service role'e açıkça verilir. Üyeler okur, yazan yalnız sunucu.
grant all on public.competitor_screens to service_role;
grant select on public.competitor_screens to authenticated;

create policy "competitor_screens: üye okur" on public.competitor_screens
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
