-- panel — ek özellikler: koleksiyonlar (Kaydet), uyarı ayarları, bildirimler.
-- Şema ↔ domain eşlemesi: src/lib/domain/{collection,notification}.ts.

-- ── Koleksiyonlar ("Kaydet" / swipe file) ──────────────────
-- Ad benzersizliği Türkçe İ/ı ve aksan duyarsızdır: uygulama katlanmış adı (collectionNameKey) name_key'e yazar,
-- benzersiz indeks buna uygulanır. Ekranda `name` görünür.
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  name_key text not null check (name_key <> ''),
  description text check (char_length(description) <= 300),
  created_at timestamptz not null default now(),
  -- Yeniden adlandırma ya da öğe ekleme/çıkarma zamanı (collection_items trigger'ı da günceller).
  updated_at timestamptz not null default now(),
  constraint collections_name_key_unique unique (workspace_id, name_key),
  constraint collections_tenant_key unique (id, workspace_id)
);
create index collections_updated_idx on public.collections (workspace_id, updated_at desc);
alter table public.collections enable row level security;
create trigger collections_set_updated_at before update on public.collections
  for each row execute function private.set_updated_at();

-- Rakip videosu SAKLANMAZ: üyelik yalnız içerik kimliği + kullanıcı notu tutar; görünen bilgi içerikten okunur.
create table public.collection_items (
  collection_id uuid not null,
  content_item_id uuid not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  note text check (char_length(note) <= 500),
  added_at timestamptz not null default now(),
  primary key (collection_id, content_item_id),
  constraint collection_items_collection_fkey foreign key (collection_id, workspace_id)
    references public.collections (id, workspace_id) on delete cascade,
  constraint collection_items_content_fkey foreign key (content_item_id, workspace_id)
    references public.content_items (id, workspace_id) on delete cascade
);
-- Toplu üyelik sorgusu ("bu içerikler hangi koleksiyonlarda?") ve içerik silinirken FK araması.
create index collection_items_content_idx on public.collection_items (workspace_id, content_item_id);
alter table public.collection_items enable row level security;

-- Öğe eklenince/çıkarılınca koleksiyonun updated_at'ı güncellenir. Security definer: istemci rolünün
-- collections.updated_at üzerinde UPDATE yetkisi olmasa da çalışır; yalnız ilgili koleksiyonun zaman damgasına dokunur.
create function private.touch_collection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.collections
     set updated_at = now()
   where id = coalesce(new.collection_id, old.collection_id);
  return null;
end;
$$;
revoke all on function private.touch_collection() from public, anon, authenticated;
create trigger collection_items_touch_collection after insert or delete on public.collection_items
  for each row execute function private.touch_collection();

-- ── Uyarı ayarları (workspace başına tek satır) ────────────
-- SIR YOK: Telegram bot anahtarı/sohbet kimliği ve e-posta gönderici sırları Vault'ta durur; domain'deki
-- `chatIdSet` Vault'ta sırrın varlığından türetilir. E-posta ADRESİ sır değildir.
-- Satır yoksa uygulama DEFAULT_ALERT_SETTINGS döndürür (varsayılanlar aşağıdakilerle aynıdır).
create table public.alert_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  competitor_outlier_enabled boolean not null default true,
  competitor_outlier_min_tier smallint not null default 3 check (competitor_outlier_min_tier between 1 and 4),
  own_outlier_enabled boolean not null default true,
  own_outlier_min_tier smallint not null default 3 check (own_outlier_min_tier between 1 and 4),
  weekly_digest_enabled boolean not null default true,
  -- 0 = Pazartesi … 6 = Pazar (WEEKDAY_LABELS sırası); saat workspace saat diliminde.
  weekly_digest_weekday smallint not null default 0 check (weekly_digest_weekday between 0 and 6),
  weekly_digest_hour smallint not null default 9 check (weekly_digest_hour between 0 and 23),
  email_enabled boolean not null default false,
  email_address text check (email_address ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  telegram_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alert_settings_email_needs_address check (not email_enabled or email_address is not null)
);
alter table public.alert_settings enable row level security;
create trigger alert_settings_set_updated_at before update on public.alert_settings
  for each row execute function private.set_updated_at();

-- ── Bildirimler ────────────────────────────────────────────
-- Yazan sunucu (service role); kullanıcı yalnız read_at günceller.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('competitor_outlier', 'own_outlier', 'weekly_digest', 'system')),
  title text not null check (btrim(title) <> ''),
  body text not null default '',
  content_item_id uuid,
  created_at timestamptz not null default now(),
  -- NULL = okunmadı.
  read_at timestamptz,
  constraint notifications_content_fkey foreign key (content_item_id, workspace_id)
    references public.content_items (id, workspace_id) on delete set null (content_item_id)
);
create index notifications_workspace_created_idx on public.notifications (workspace_id, created_at desc);
-- Zil rozeti / "okunmamışlar" listesi.
create index notifications_unread_idx on public.notifications (workspace_id, created_at desc) where read_at is null;
-- Tick her koşuda aynı tutan içerik için tekrar bildirim üretmesin (on conflict do nothing).
create unique index notifications_outlier_once_key
  on public.notifications (workspace_id, kind, content_item_id)
  where kind in ('competitor_outlier', 'own_outlier') and content_item_id is not null;
-- content_item_id ON DELETE SET NULL FK araması.
create index notifications_content_idx on public.notifications (content_item_id) where content_item_id is not null;
alter table public.notifications enable row level security;
