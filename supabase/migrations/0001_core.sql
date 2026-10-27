-- panel — çekirdek şema: workspace, üyelik, hesaplar, koşular ve bütçe.
-- Şema ↔ domain eşlemesi: src/lib/domain/{run,competitor}.ts. Her migration tek konu;
-- politikalar ve yetki matrisi 0006_rls.sql'de. RLS her tablo yaratılırken açılır (politikasız = kapalı kapı).

-- ── Gizli şema ─────────────────────────────────────────────
-- PostgREST'e AÇILMAZ (config.toml [api].schemas): RLS yardımcıları ve trigger fonksiyonları burada durur,
-- böylece /rest/v1/rpc/* üzerinden çağrılamazlar ve security advisor "definer fonksiyon açık" uyarısı çıkmaz.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Bundan sonra `public`te yaratılan tablo/sequence'lar varsayılan olarak istemci rollerine (anon, authenticated)
-- KAPALI olur; erişim 0006_rls.sql'deki açık GRANT'lerle verilir. (Fonksiyonlarda PUBLIC'in küresel EXECUTE'u
-- şema bazında geri alınamaz; her fonksiyon kendi REVOKE'unu taşır.)
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ── Ortak tipler (lib/platforms/types.ts ile birebir) ──────
create type public.platform as enum ('instagram', 'tiktok', 'youtube');
create type public.content_format as enum ('short_video', 'long_video', 'image', 'carousel', 'story');
-- "views" sayısının anlamı platforma/API'ye göre değişir; farklı türler baz çizgisinde KARIŞTIRILMAZ.
create type public.views_kind as enum ('ig_play_count', 'ig_view_count', 'ig_views', 'tt_play_count', 'yt_views');

-- updated_at bakımı (BEFORE UPDATE trigger'ı olarak bağlanır).
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── Profiller (auth.users'ın uygulama yüzü; handle_new_user 0006'da) ──
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ── Workspace ──────────────────────────────────────────────
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  timezone text not null default 'Europe/Istanbul' check (char_length(timezone) between 1 and 64),
  niche_brief text check (char_length(niche_brief) <= 2000),
  -- Aylık tavanlar (USD). Kaldırılamaz (NOT NULL); 0 = harcama kapalı (yeni paralı koşu başlamaz).
  apify_monthly_cap_usd numeric(12, 6) not null default 10
    constraint workspaces_apify_cap_range check (apify_monthly_cap_usd between 0 and 1000),
  llm_monthly_cap_usd numeric(12, 6) not null default 10
    constraint workspaces_llm_cap_range check (llm_monthly_cap_usd between 0 and 1000),
  compliance_region text not null default 'TR' check (compliance_region in ('TR', 'US', 'TR_US')),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;
create trigger workspaces_set_updated_at before update on public.workspaces
  for each row execute function private.set_updated_at();

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
-- member_workspace_ids() / kullanıcının çalışma alanları araması user_id ile başlar.
create index workspace_members_user_idx on public.workspace_members (user_id);
alter table public.workspace_members enable row level security;

-- ── Kendi hesaplar ─────────────────────────────────────────
-- Profil alanları (followers/following/posts_count) SON ölçümün kopyasıdır; zaman serisi account_snapshots'ta.
-- Ölçülemeyen = NULL (0 değil).
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform public.platform not null,
  handle text not null check (handle ~ '^[a-z0-9._-]{1,50}$'),
  external_id text,
  display_name text,
  followers bigint check (followers >= 0),
  following bigint check (following >= 0),
  posts_count bigint check (posts_count >= 0),
  avatar_url text,
  -- scrape_only: yalnız herkese açık kazıma · connected: resmi API (OAuth) · expired: token doldu · revoked: erişim geri alındı
  connection text not null default 'scrape_only'
    check (connection in ('scrape_only', 'connected', 'expired', 'revoked')),
  scopes text[] not null default '{}',
  -- Token'ın kendisi social_account_tokens'ta (Vault); yalnız SON KULLANMA anı burada okunabilir.
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_accounts_handle_unique unique (workspace_id, platform, handle),
  -- Alt tablolar (içerik, yayın işi …) çalışma alanı + platform tutarlılığını bileşik FK ile korur.
  constraint social_accounts_tenant_key unique (id, workspace_id, platform),
  constraint social_accounts_connected_needs_external_id check (connection <> 'connected' or external_id is not null)
);
create unique index social_accounts_external_id_key
  on public.social_accounts (workspace_id, platform, external_id) where external_id is not null;
alter table public.social_accounts enable row level security;
create trigger social_accounts_set_updated_at before update on public.social_accounts
  for each row execute function private.set_updated_at();

-- Token'lar: Vault secret kimliği. RLS AÇIK, POLİTİKA YOK, istemci rollerinden tüm yetki geri alınır
-- → yalnız service role okur/yazar (0006'da açıkça doğrulanır).
create table public.social_account_tokens (
  social_account_id uuid primary key references public.social_accounts (id) on delete cascade,
  -- vault.secrets.id (şemalar arası FK yok: Vault kendi yaşam döngüsünü yönetir).
  vault_secret_id uuid not null,
  last_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.social_account_tokens enable row level security;
create trigger social_account_tokens_set_updated_at before update on public.social_account_tokens
  for each row execute function private.set_updated_at();

-- ── Rakipler ───────────────────────────────────────────────
-- candidate: keşfedildi · tracked: takipte · ignored: yoksayıldı · private/not_found: toplama sonucu (yalnız sunucu yazar).
create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform public.platform not null,
  handle text not null check (handle ~ '^[a-z0-9._-]{1,50}$'),
  external_id text,
  display_name text,
  bio text,
  followers bigint check (followers >= 0),
  following bigint check (following >= 0),
  posts_count bigint check (posts_count >= 0),
  is_verified boolean,
  category text,
  avatar_url text,
  status text not null default 'candidate'
    check (status in ('candidate', 'tracked', 'ignored', 'private', 'not_found')),
  source text not null default 'manual' check (source in ('manual', 'related', 'search')),
  -- source = related/search ise adayı hangi hesap/sorgu getirdi.
  discovered_via text,
  missing_fields text[] not null default '{}',
  last_collected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitors_handle_unique unique (workspace_id, platform, handle),
  constraint competitors_tenant_key unique (id, workspace_id, platform),
  constraint competitors_discovered_via_needs_source check (discovered_via is null or source <> 'manual')
);
create index competitors_status_idx on public.competitors (workspace_id, status);
alter table public.competitors enable row level security;
create trigger competitors_set_updated_at before update on public.competitors
  for each row execute function private.set_updated_at();

-- ── Paralı çağrı koşuları ──────────────────────────────────
-- Apify + LLM + STT + Graph API her çağrı burada izlenir. actual_usd NULL = mutabakat YOK (0 DEĞİL);
-- 0 = "ölçtük, sıfır". Ay toplamı greatest(coalesce(actual, 0), reserved) ile sayılır (reserve_budget).
create table public.collection_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null
    check (provider in ('apify', 'anthropic', 'openai', 'deepgram', 'graph_api', 'claude_cli', 'gemini')),
  -- Domain RunKind: profile, content, discovery_related, discovery_search, llm_analysis, llm_ideas, transcription.
  -- Yeni tür migration istemesin diye yalnız biçim doğrulanır.
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{1,40}$'),
  status text not null default 'reserved'
    check (status in ('reserved', 'running', 'succeeded', 'ingested', 'failed', 'aborted', 'timed_out')),
  target_label text,
  external_run_id text,
  dataset_id text,
  reserved_usd numeric(12, 6) not null default 0 check (reserved_usd >= 0),
  actual_usd numeric(12, 6) check (actual_usd >= 0),
  price_unknown boolean not null default false,
  expected_results integer check (expected_results >= 0),
  item_count integer check (item_count >= 0),
  -- NULL = henüz işlenmedi; '[]' = işlendi, elenen yok. Öğe: {"reason": "..."} (ParseResult.notItems).
  not_item_reasons jsonb check (not_item_reasons is null or jsonb_typeof(not_item_reasons) in ('array', 'object')),
  error text,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint collection_runs_tenant_key unique (id, workspace_id),
  constraint collection_runs_finished_after_start check (finished_at is null or finished_at >= started_at)
);
comment on column public.collection_runs.actual_usd is 'NULL = mutabakat yapılmadı (0 DEĞİL). 0 = ölçüldü, sıfır.';
-- Webhook/poll idempotency: aynı sağlayıcı koşusu iki satıra dönüşmez.
create unique index collection_runs_external_run_key
  on public.collection_runs (provider, external_run_id) where external_run_id is not null;
-- Ay toplamı (reserve_budget) ve maliyet ekranı: workspace + zaman aralığı.
create index collection_runs_month_idx on public.collection_runs (workspace_id, started_at desc);
-- Mutabakat/temizlik: bitmemiş koşular.
create index collection_runs_open_idx on public.collection_runs (workspace_id)
  where status in ('reserved', 'running', 'succeeded');
alter table public.collection_runs enable row level security;
create trigger collection_runs_set_updated_at before update on public.collection_runs
  for each row execute function private.set_updated_at();

-- ── Bütçe rezervasyonu ─────────────────────────────────────
-- Paralı çağrıdan ÖNCE çağrılır; tavan aşılırsa koşu HİÇ başlamaz ('budget_exceeded').
--  - Tavan grubu: apify → apify_monthly_cap_usd; anthropic/openai/deepgram/gemini/claude_cli → llm_monthly_cap_usd;
--    graph_api ücretsizdir → tavan kontrolü yok (koşu yine kaydedilir).
--  - Ay = workspace saat diliminde takvim ayı (CostSummary.month ile aynı).
--  - Ay toplamı Σ greatest(coalesce(actual_usd, 0), reserved_usd): mutabakatta gerçek tutar rezerveyi aşarsa o sayılır.
--    Boşa çıkan rezerveyi serbest bırakmak için mutabakatta uygulama reserved_usd'yi gerçek tutara indirir.
--  - Aynı workspace+grup için eşzamanlı çağrılar advisory xact kilidiyle sıralanır (aşırı rezervasyon yarışı yok).
--  - Tutarı 0 olan rezervasyon (ücretsiz çağrı: claude_cli, Graph API) tavana takılmaz; cap = 0 yalnız paralı koşuları kapatır.
--  - security INVOKER: service role RLS'yi aşar; yanlışlıkla başka role EXECUTE verilse bile RLS insert'i engeller.
-- p_run anahtarları: kind (zorunlu), target_label, external_run_id, dataset_id, expected_results, price_unknown.
create function public.reserve_budget(
  p_ws uuid,
  p_provider text,
  p_amount numeric,
  p_run jsonb default '{}'::jsonb
)
returns public.collection_runs
language plpgsql
set search_path = ''
as $$
declare
  v_providers text[];
  v_cap numeric;
  v_tz text;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_committed numeric := 0;
  v_run public.collection_runs;
begin
  if p_ws is null or p_provider is null or p_amount is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  if p_amount < 0 or p_amount = 'NaN'::numeric or p_amount = 'Infinity'::numeric then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_run is null or jsonb_typeof(p_run) <> 'object' then
    raise exception 'invalid_argument' using errcode = '22023', detail = 'p_run bir JSON nesnesi olmalı';
  end if;
  if nullif(btrim(p_run ->> 'kind'), '') is null then
    raise exception 'run_kind_required' using errcode = '22023';
  end if;

  if p_provider not in ('apify', 'anthropic', 'openai', 'deepgram', 'gemini', 'claude_cli', 'graph_api') then
    raise exception 'unknown_provider' using errcode = '22023', detail = p_provider;
  end if;
  -- Aynı tavanı paylaşan sağlayıcılar (NULL = tavansız: graph_api).
  v_providers := case
    when p_provider = 'apify' then array['apify']
    when p_provider <> 'graph_api' then array['anthropic', 'openai', 'deepgram', 'gemini', 'claude_cli']
  end;

  if v_providers is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('reserve_budget:' || p_ws::text || ':' || v_providers[1], 0)
    );
  end if;

  select w.timezone,
         case when p_provider = 'apify' then w.apify_monthly_cap_usd else w.llm_monthly_cap_usd end
    into v_tz, v_cap
    from public.workspaces w
   where w.id = p_ws;
  if not found then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  if v_providers is not null then
    v_month_start := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
    v_month_end := (date_trunc('month', now() at time zone v_tz) + interval '1 month') at time zone v_tz;

    select coalesce(sum(greatest(coalesce(r.actual_usd, 0), r.reserved_usd)), 0)
      into v_committed
      from public.collection_runs r
     where r.workspace_id = p_ws
       and r.provider = any (v_providers)
       and r.started_at >= v_month_start
       and r.started_at < v_month_end;

    if p_amount > 0 and v_committed + p_amount > v_cap then
      raise exception 'budget_exceeded'
        using detail = format('cap=%s committed=%s requested=%s', v_cap, v_committed, p_amount),
              hint = 'Aylık tavanı Ayarlar ekranından artır ya da ay başını bekle.';
    end if;
  end if;

  insert into public.collection_runs (
    workspace_id, provider, kind, status, target_label, external_run_id, dataset_id,
    reserved_usd, price_unknown, expected_results
  )
  values (
    p_ws, p_provider, btrim(p_run ->> 'kind'), 'reserved', p_run ->> 'target_label',
    p_run ->> 'external_run_id', p_run ->> 'dataset_id',
    p_amount, coalesce((p_run ->> 'price_unknown')::boolean, false), (p_run ->> 'expected_results')::integer
  )
  returning * into v_run;

  return v_run;
end;
$$;

-- Yalnız service role çağırır (PostgREST: authenticated/anon 403).
revoke all on function public.reserve_budget(uuid, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_budget(uuid, text, numeric, jsonb) to service_role;
