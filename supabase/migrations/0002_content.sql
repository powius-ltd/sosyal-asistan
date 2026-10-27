-- panel — içerik: içerik kaydı + skor önbelleği, metrik zaman serisi, hesap zaman serisi.
-- Şema ↔ domain eşlemesi: src/lib/domain/content.ts. Ölçülemeyen değer NULL'dır (0 değil).
-- Çalışma alanı tutarlılığı bileşik FK'larla korunur: bir satır başka çalışma alanının hesabına/içeriğine bağlanamaz.

-- ── İçerik ─────────────────────────────────────────────────
-- Sahip: kendi hesap XOR rakip. platform, sahibin platformuyla bileşik FK'yla aynı olmaya zorlanır.
create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform public.platform not null,
  social_account_id uuid,
  competitor_id uuid,
  external_id text not null check (btrim(external_id) <> ''),
  shortcode text,
  url text,
  format public.content_format not null,
  published_at timestamptz,
  caption text,
  hashtags text[] not null default '{}',
  duration_sec numeric check (duration_sec >= 0),
  -- NULL = bilinmiyor. Baz çizgisi yalnız `is_pinned = true` olanları dışlar.
  is_pinned boolean,
  is_paid_partnership boolean,
  -- Herkese açık CDN bağlantısı (süresi dolabilir); medya dosyası SAKLANMAZ.
  thumbnail_url text,
  -- Normalize sırasında ölçülemeyen alanlar (ör. {saves,reach}).
  missing_fields text[] not null default '{}',

  -- Skor önbelleği + "bu lift neden böyle?" AYNI hesaplama anından (lib/metrics; okurken yeniden hesaplanmaz).
  views_kind public.views_kind,
  baseline_views double precision
    check (baseline_views is null or (baseline_views >= 0 and baseline_views < 'Infinity'::float8)),
  baseline_n integer check (baseline_n >= 0),
  -- BaselineExcludedCounts: baz çizgisi dışında kalanların sayaçları (her içerik ilk takıldığı kuralda sayılır).
  baseline_excluded jsonb check (
    baseline_excluded is null or (
      jsonb_typeof(baseline_excluded) = 'object'
      and baseline_excluded ?& array['self', 'otherFormat', 'pinned', 'noViews', 'differentViewsKind', 'noDate', 'tooYoung']
    )
  ),
  -- Baz çizgisine giren içerikler, yeniden eskiye, en çok 25: [{"contentItemId": uuid, "views": n, "publishedAt": iso?}]
  -- (BaselineExplanation.basis). Skorla AYNI anda yazılır; "bu lift neden böyle?" okurken yeniden hesaplanmaz.
  baseline_basis jsonb check (baseline_basis is null or jsonb_typeof(baseline_basis) = 'array'),
  lift double precision check (lift is null or (lift >= 0 and lift < 'Infinity'::float8)),
  -- 0: <1.5x · 1: ≥1.5x · 2: ≥2x · 3: ≥3x · 4: ≥5x (LIFT_TIER_MIN). NULL = ölçülemedi (0 değil).
  lift_tier smallint check (lift_tier between 0 and 4),
  low_confidence boolean not null default false,
  immature boolean not null default false,
  cross_score double precision
    check (cross_score is null or (cross_score > '-Infinity'::float8 and cross_score < 'Infinity'::float8)),
  scored_at timestamptz,

  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint content_items_external_key unique (workspace_id, platform, external_id),
  constraint content_items_tenant_key unique (id, workspace_id),
  constraint content_items_owner_xor check (num_nonnulls(social_account_id, competitor_id) = 1),
  constraint content_items_lift_tier_pair check ((lift is null) = (lift_tier is null)),
  constraint content_items_lift_needs_baseline check (lift is null or (baseline_views is not null and baseline_n is not null)),
  constraint content_items_social_account_fkey foreign key (social_account_id, workspace_id, platform)
    references public.social_accounts (id, workspace_id, platform) on delete cascade,
  constraint content_items_competitor_fkey foreign key (competitor_id, workspace_id, platform)
    references public.competitors (id, workspace_id, platform) on delete cascade
);
comment on column public.content_items.is_pinned is 'NULL = bilinmiyor (false değil).';
comment on column public.content_items.lift is 'views / baz çizgisi medyanı. NULL = ölçülemedi (0 değil).';

-- Genel liste (yeniden eskiye) ve FK/cascade aramaları (sahip başına).
create index content_items_workspace_published_idx on public.content_items (workspace_id, published_at desc nulls last);
create index content_items_account_published_idx
  on public.content_items (social_account_id, published_at desc nulls last) where social_account_id is not null;
create index content_items_competitor_published_idx
  on public.content_items (competitor_id, published_at desc nulls last) where competitor_id is not null;
-- Tutanlar/İçerikler: lift ve crossScore sıralaması. Ölçülemeyen (NULL) en sonda; sorgu da `desc nulls last` istemeli
-- (kısmi indeks değil: `lift_tier >= 3` gibi süzgeçler `lift is not null` koşulunu planlayıcıya kanıtlayamaz).
create index content_items_lift_idx on public.content_items (workspace_id, lift desc nulls last);
create index content_items_cross_score_idx on public.content_items (workspace_id, cross_score desc nulls last);

alter table public.content_items enable row level security;
create trigger content_items_set_updated_at before update on public.content_items
  for each row execute function private.set_updated_at();

-- ── Metrik zaman serisi ────────────────────────────────────
-- Ölçülemeyen alan yazılmaz (NULL). views_kind farklı türleri ayırır (ig_play_count ≠ ig_view_count).
create table public.metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  content_item_id uuid not null,
  captured_at timestamptz not null default now(),
  views bigint check (views >= 0),
  views_kind public.views_kind,
  likes bigint check (likes >= 0),
  comments bigint check (comments >= 0),
  shares bigint check (shares >= 0),
  saves bigint check (saves >= 0),
  reach bigint check (reach >= 0),
  avg_watch_sec double precision check (avg_watch_sec >= 0 and avg_watch_sec < 'Infinity'::float8),
  -- Bu ölçüm anındaki sahip takipçi sayısı (etkileşim oranı / crossScore paydası).
  owner_followers bigint check (owner_followers >= 0),
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  source text not null check (source in ('apify', 'graph_api', 'youtube_api')),
  collection_run_id uuid,
  constraint metric_snapshots_content_fkey foreign key (content_item_id, workspace_id)
    references public.content_items (id, workspace_id) on delete cascade,
  constraint metric_snapshots_run_fkey foreign key (collection_run_id, workspace_id)
    references public.collection_runs (id, workspace_id) on delete set null (collection_run_id)
);
create index metric_snapshots_content_captured_idx on public.metric_snapshots (content_item_id, captured_at desc);
create index metric_snapshots_workspace_captured_idx on public.metric_snapshots (workspace_id, captured_at desc);
-- Ingest idempotency: aynı koşu aynı içeriğe en çok bir ölçüm yazar (on conflict do nothing); FK araması da bunu kullanır.
create unique index metric_snapshots_run_content_key
  on public.metric_snapshots (collection_run_id, content_item_id) where collection_run_id is not null;
alter table public.metric_snapshots enable row level security;

-- ── Son ölçüm görünümü ─────────────────────────────────────
-- İçerik başına EN SON ölçüm (tek satırın tüm alanları; alan bazında karışım yok, captured_at tek zamandır).
-- Hiç ölçülmemiş içerik de görünür (metrik alanları NULL, captured_at NULL = "hiç ölçülmedi").
-- security_invoker: çağıranın RLS'i uygulanır. content_items'tan başlar → workspace/içerik süzgeçleri baştan iner,
-- ölçüm araması (content_item_id, captured_at desc) indeksiyle içerik başına tek satır okunur.
create view public.content_latest_metrics with (security_invoker = true) as
select
  ci.id as content_item_id,
  ci.workspace_id,
  m.id as snapshot_id,
  m.captured_at,
  m.views,
  m.views_kind,
  m.likes,
  m.comments,
  m.shares,
  m.saves,
  m.reach,
  m.avg_watch_sec,
  m.owner_followers,
  m.extra,
  m.source
from public.content_items ci
left join lateral (
  select s.*
    from public.metric_snapshots s
   where s.content_item_id = ci.id
   order by s.captured_at desc, s.id desc
   limit 1
) m on true;

-- ── Hesap zaman serisi (kendi hesap ya da rakip) ───────────
create table public.account_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform public.platform not null,
  social_account_id uuid,
  competitor_id uuid,
  captured_at timestamptz not null default now(),
  followers bigint check (followers >= 0),
  following bigint check (following >= 0),
  posts_count bigint check (posts_count >= 0),
  -- Resmi API hesap insight'ları (reach, profile_views …).
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  source text not null check (source in ('apify', 'graph_api', 'youtube_api')),
  collection_run_id uuid,
  constraint account_snapshots_owner_xor check (num_nonnulls(social_account_id, competitor_id) = 1),
  constraint account_snapshots_social_account_fkey foreign key (social_account_id, workspace_id, platform)
    references public.social_accounts (id, workspace_id, platform) on delete cascade,
  constraint account_snapshots_competitor_fkey foreign key (competitor_id, workspace_id, platform)
    references public.competitors (id, workspace_id, platform) on delete cascade,
  constraint account_snapshots_run_fkey foreign key (collection_run_id, workspace_id)
    references public.collection_runs (id, workspace_id) on delete set null (collection_run_id)
);
create index account_snapshots_social_account_idx
  on public.account_snapshots (social_account_id, captured_at desc) where social_account_id is not null;
create index account_snapshots_competitor_idx
  on public.account_snapshots (competitor_id, captured_at desc) where competitor_id is not null;
create index account_snapshots_workspace_captured_idx on public.account_snapshots (workspace_id, captured_at desc);
-- Ingest idempotency (koşu başına hesap başına en çok bir ölçüm); run FK araması da bunları kullanır.
create unique index account_snapshots_run_social_account_key
  on public.account_snapshots (collection_run_id, social_account_id)
  where collection_run_id is not null and social_account_id is not null;
create unique index account_snapshots_run_competitor_key
  on public.account_snapshots (collection_run_id, competitor_id)
  where collection_run_id is not null and competitor_id is not null;
alter table public.account_snapshots enable row level security;
