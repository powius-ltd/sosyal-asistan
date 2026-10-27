-- panel — reklam modülü R0: veri sözleşmesi. Plan: docs/REKLAM-MODUL-PLAN.md §7, docs/isler/17-reklam-sozlesme/SPEC.md.
-- Gerçek veri taşıyan veritabanına `migration up` ile UYGULANIR (db reset YOK): yalnız eklemeli (6 yeni tablo + iş türü listesi).
-- v1 reklam hesabından OKUR ve ÖNERİR: bu tablolar sağlayıcıdan okunan değerlerin aynasıdır (`daily_budget` dahil); panel hesaba yazmaz.
-- Yazan yalnız sunucu (service role); üye okur. Para sütunları numeric ve hesabın KENDİ para biriminde (`ad_accounts.currency`); farklı
-- para birimli hesapların toplamları birleştirilmez. Ölçülemeyen = NULL (0 değil).

-- ── Hesap ──────────────────────────────────────────────────
create table public.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null default 'zernio' check (provider in ('zernio')),
  -- Sağlayıcıdaki reklam hesabı kimliği ("act_…") ve sağlayıcının (Zernio) kendi hesap kimliği.
  external_account_id text not null check (btrim(external_account_id) <> '' and char_length(external_account_id) <= 100),
  provider_account_id text check (provider_account_id is null or (btrim(provider_account_id) <> '' and char_length(provider_account_id) <= 100)),
  label text check (label is null or char_length(label) <= 200),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'unknown' check (status in ('active', 'disabled', 'unknown')),
  -- Hedef (isteğe bağlı): yoksa hesabın hiçbir reklamı karar almaz. `value` getiri modu, `cost` sonuç-maliyeti modu.
  goal_kind text check (goal_kind in ('value', 'cost')),
  result_label text check (result_label is null or (btrim(result_label) <> '' and char_length(result_label) <= 100)),
  target_return numeric check (target_return is null or target_return > 0),
  gross_margin numeric check (gross_margin is null or (gross_margin > 0 and gross_margin <= 1)),
  target_cost_per_result numeric check (target_cost_per_result is null or target_cost_per_result > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_accounts_unique unique (workspace_id, provider, external_account_id),
  constraint ad_accounts_ws_id unique (id, workspace_id),
  -- Hedef ya hiç yok ya da türüne göre tam: getiri modunda hedef getiri, maliyet modunda hedef maliyet şart; sonuç adı her ikisinde şart.
  constraint ad_accounts_goal_shape check (
    (goal_kind is null and result_label is null and target_return is null and gross_margin is null and target_cost_per_result is null)
    or (goal_kind = 'value' and result_label is not null and target_return is not null and target_cost_per_result is null)
    or (goal_kind = 'cost' and result_label is not null and target_cost_per_result is not null and target_return is null and gross_margin is null)
  )
);
create index ad_accounts_workspace_idx on public.ad_accounts (workspace_id);

-- ── Yapı: kampanya → reklam seti → reklam; kreatif ─────────────
-- Her tablo çalışma alanını taşır (RLS tek koşul); üst kayıtla çalışma alanı bileşik yabancı anahtarla eşleşmek ZORUNDA.
create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  account_id uuid not null,
  external_id text not null check (btrim(external_id) <> '' and char_length(external_id) <= 100),
  name text not null check (char_length(name) <= 300),
  status text not null default 'unknown' check (status in ('active', 'paused', 'archived', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_campaigns_unique unique (account_id, external_id),
  constraint ad_campaigns_ws_id unique (id, workspace_id),
  constraint ad_campaigns_account_fkey foreign key (account_id, workspace_id) references public.ad_accounts (id, workspace_id) on delete cascade
);
create index ad_campaigns_workspace_idx on public.ad_campaigns (workspace_id, account_id);

create table public.ad_sets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid not null,
  external_id text not null check (btrim(external_id) <> '' and char_length(external_id) <= 100),
  name text not null check (char_length(name) <= 300),
  status text not null default 'unknown' check (status in ('active', 'paused', 'archived', 'unknown')),
  -- Sağlayıcıdan OKUNAN günlük bütçe (hesabın para biriminde); panel bu değeri yazmaz.
  daily_budget numeric check (daily_budget is null or daily_budget >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_sets_unique unique (campaign_id, external_id),
  constraint ad_sets_ws_id unique (id, workspace_id),
  constraint ad_sets_campaign_fkey foreign key (campaign_id, workspace_id) references public.ad_campaigns (id, workspace_id) on delete cascade
);
create index ad_sets_workspace_idx on public.ad_sets (workspace_id, campaign_id);

create table public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  account_id uuid not null,
  external_id text check (external_id is null or (btrim(external_id) <> '' and char_length(external_id) <= 100)),
  format text not null default 'unknown' check (format in ('video', 'image', 'carousel', 'unknown')),
  aspect text check (aspect is null or char_length(aspect) <= 20),
  -- Kreatif kendi içeriğiyse o içerik; dış reklamda NULL. İçerik silinirse bağ kopar, kreatif kalır.
  source_content_id uuid references public.content_items (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_creatives_ws_id unique (id, workspace_id),
  constraint ad_creatives_account_fkey foreign key (account_id, workspace_id) references public.ad_accounts (id, workspace_id) on delete cascade
);
create unique index ad_creatives_external_idx on public.ad_creatives (account_id, external_id) where external_id is not null;
create index ad_creatives_workspace_idx on public.ad_creatives (workspace_id, account_id);
create index ad_creatives_content_idx on public.ad_creatives (source_content_id) where source_content_id is not null;

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  ad_set_id uuid not null,
  creative_id uuid,
  external_id text not null check (btrim(external_id) <> '' and char_length(external_id) <= 100),
  name text not null check (char_length(name) <= 300),
  status text not null default 'unknown' check (status in ('active', 'paused', 'archived', 'unknown')),
  started_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ads_unique unique (ad_set_id, external_id),
  constraint ads_ws_id unique (id, workspace_id),
  constraint ads_ad_set_fkey foreign key (ad_set_id, workspace_id) references public.ad_sets (id, workspace_id) on delete cascade,
  constraint ads_creative_fkey foreign key (creative_id, workspace_id) references public.ad_creatives (id, workspace_id)
);
create index ads_workspace_idx on public.ads (workspace_id, ad_set_id);
create index ads_creative_idx on public.ads (creative_id) where creative_id is not null;

-- ── Günlük ölçü ────────────────────────────────────────────
-- Birincil anahtar (reklam, gün): aynı gün ikinci kez yazılamaz (sunucu upsert eder). İsteğe bağlı sütunlar ölçülmediyse NULL.
create table public.ad_daily_metrics (
  ad_id uuid not null,
  date date not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  spend numeric not null check (spend >= 0),
  impressions bigint not null check (impressions >= 0),
  clicks bigint check (clicks is null or clicks >= 0),
  results numeric check (results is null or results >= 0),
  result_value numeric check (result_value is null or result_value >= 0),
  frequency numeric check (frequency is null or frequency >= 0),
  reach bigint check (reach is null or reach >= 0),
  video_3s_views bigint check (video_3s_views is null or video_3s_views >= 0),
  video_thruplays bigint check (video_thruplays is null or video_thruplays >= 0),
  avg_watch_sec numeric check (avg_watch_sec is null or avg_watch_sec >= 0),
  fetched_at timestamptz not null default now(),
  primary key (ad_id, date),
  constraint ad_daily_metrics_ad_fkey foreign key (ad_id, workspace_id) references public.ads (id, workspace_id) on delete cascade
);
create index ad_daily_metrics_workspace_idx on public.ad_daily_metrics (workspace_id, date desc);

comment on table public.ad_accounts is 'Reklam hesabı (okuma): sağlayıcıdan okunan hesap + kullanıcının girdiği hedef. Panel hesaba yazmaz.';
comment on table public.ad_daily_metrics is 'Reklamın günlük ölçüsü (okuma). Ölçülmeyen alan NULL; 0 değildir.';

-- ── Yetki + RLS ────────────────────────────────────────────
-- 0027 deseni: istemci rollerine varsayılan yetki kapalı; service role'e açıkça verilir. Üyeler okur, yazan yalnız sunucu.
grant all on public.ad_accounts, public.ad_campaigns, public.ad_sets, public.ad_creatives, public.ads, public.ad_daily_metrics to service_role;
grant select on public.ad_accounts, public.ad_campaigns, public.ad_sets, public.ad_creatives, public.ads, public.ad_daily_metrics to authenticated;

alter table public.ad_accounts enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.ad_sets enable row level security;
alter table public.ad_creatives enable row level security;
alter table public.ads enable row level security;
alter table public.ad_daily_metrics enable row level security;

create policy "ad_accounts: üye okur" on public.ad_accounts for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "ad_campaigns: üye okur" on public.ad_campaigns for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "ad_sets: üye okur" on public.ad_sets for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "ad_creatives: üye okur" on public.ad_creatives for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "ads: üye okur" on public.ads for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "ad_daily_metrics: üye okur" on public.ad_daily_metrics for select to authenticated using (workspace_id in (select private.member_workspace_ids()));

-- ── İş türü ────────────────────────────────────────────────
-- `ads_sync`: Zernio'dan reklam verisini okur. $0, onaysız (Apify parası yok, reklam hesabına yazmaz), önizlemesiz. Yalnız tür listesi
-- genişler (EKLEMELİ; veri silmez). Harcama / onay kısıtları aynen kalır: `ads_sync` onay alanı taşıyamaz.
alter table public.panel_jobs
  drop constraint panel_jobs_kind_check,
  add constraint panel_jobs_kind_check check (kind in ('routine', 'collect', 'measure', 'analyze', 'label', 'plan', 'briefing', 'onboarding', 'measure_zernio', 'discover', 'order', 'order_return', 'publish', 'ads_sync'));
