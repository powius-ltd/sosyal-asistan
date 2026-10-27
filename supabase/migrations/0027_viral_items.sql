-- panel — viral av: konuyla patlamış video havuzu (hesabını bilmediğimiz kişilerin videoları).
-- Şema ↔ domain eşlemesi: src/lib/viral/store.ts; yazan `viral:hunt` (sunucu, service role). Plan: docs/isler/05-viral-av/SPEC.md.
-- Gerçek veri taşıyan veritabanına `migration up` ile UYGULANIR (db reset YOK): yalnız eklemeli (yeni tablo); mevcut satırlara dokunmaz.
-- Viral video rakip içeriği DEĞİLDİR: `content_items`'a girmez, skor / baz çizgisine karışmaz.
-- SAKLANMAZ (şasi kuralı): video, kapak, yorum, etiketlenen / anılan kişi, yazarın adı / fotoğrafı / biyografisi.

create table public.viral_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform public.platform not null,
  -- Platformdaki içerik kimliği (IG kısa kodu / TikTok video kimliği); (çalışma alanı, platform, kimlik) tek satır.
  external_id text not null check (btrim(external_id) <> '' and char_length(external_id) <= 100),
  -- Yazarın herkese açık kullanıcı adı (küçük harf); ad / kimlik / fotoğraf YOK.
  author_handle text not null check (btrim(author_handle) <> '' and char_length(author_handle) <= 100),
  -- Ölçülemeyen = NULL (0 değil): takipçi okunamazsa oran da NULL, satır eşikten geçmez.
  author_followers bigint check (author_followers is null or author_followers >= 0),
  views bigint not null check (views >= 0),
  views_kind public.views_kind not null,
  likes bigint check (likes is null or likes >= 0),
  comments bigint check (comments is null or comments >= 0),
  shares bigint check (shares is null or shares >= 0),
  -- izlenme / takipçi; takipçi yok ya da 0 ise NULL.
  views_per_follower numeric check (views_per_follower is null or views_per_follower >= 0),
  published_at timestamptz not null,
  duration_sec numeric check (duration_sec is null or duration_sec >= 0),
  caption text check (caption is null or char_length(caption) <= 500),
  hashtags text[] not null default '{}' check (cardinality(hashtags) <= 60),
  content_url text not null check (content_url ~ '^https?://'),
  -- Bulan sorgu (konu); aynı video başka sorguyla gelirse ilk bulan kalır.
  query text not null check (btrim(query) <> '' and char_length(query) <= 200),
  found_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  constraint viral_items_unique unique (workspace_id, platform, external_id)
);
create index viral_items_workspace_idx on public.viral_items (workspace_id, platform, found_at desc);
create index viral_items_query_idx on public.viral_items (workspace_id, query);
alter table public.viral_items enable row level security;

comment on table public.viral_items is 'Viral av havuzu: konu sorgusuyla bulunan patlamış videolar (izlenme / takipçi oranı). Rakip içeriği değildir; video, yorum, kişi verisi saklanmaz.';

-- ── Yetki + RLS ────────────────────────────────────────────
-- 0008 deseni: istemci rollerine varsayılan yetki kapalı; service role'e açıkça verilir. Üyeler okur, yazan yalnız sunucu.
grant all on public.viral_items to service_role;
grant select on public.viral_items to authenticated;

create policy "viral_items: üye okur" on public.viral_items
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
