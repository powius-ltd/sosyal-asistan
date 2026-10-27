-- panel — 0030: yönetici ajan (paket 22; docs/isler/22-yonetici-ajan/SPEC.md).
-- Şema ↔ domain: src/lib/domain/{workspace,run,panel-job}.ts (`Workspace` ajan alanları, `llm_director` koşu türü, `source: "agent"`).
-- YALNIZ EKLEMELİ: `workspaces`'e sütunlar, bir INSERT trigger'ı, `create_workspace`'in AYNI imzayla yeniden tanımı (tek fark: yeni hesaba
-- 3 USD ajan tavanı + onay damgası). Mevcut satırlara dokunmaz: mevcut hesapların ajan tavanı NULL (onaysız) kalır. db reset YOK.
--
-- Tasarım: ajan, hesabın AYLIK AJAN TAVANI içinde toplama (`collect`) ve rakip bulmayı (`discover`) onaysız tek tek sormadan açabilir.
-- Tavanı vermek onaydır (ölçüm tavanı deseni, 0010): tavan ve onay zamanı birlikte yazılır, NULL = onaysız = ajan para harcayamaz.
-- Ajan yalnız `monthly_cap` dayanağıyla ve `params.source = 'agent'` ile açar; DB bu dayanağı onaysız tavanda REDDEDER (trigger).

alter table public.workspaces
  add column agent_monthly_cap_usd numeric(12, 6) constraint workspaces_agent_cap_range check (agent_monthly_cap_usd between 0 and 1000),
  add column agent_cap_approved_at timestamptz,
  add column agent_cap_approved_by uuid references auth.users (id) on delete set null,
  add column collect_every_days integer not null default 14 constraint workspaces_collect_every_range check (collect_every_days between 1 and 60),
  add column collect_video_limit integer not null default 25 constraint workspaces_collect_limit_range check (collect_video_limit between 5 and 50),
  add column rival_target integer not null default 3 constraint workspaces_rival_target_range check (rival_target between 0 and 10),
  add constraint workspaces_agent_cap_approved check ((agent_monthly_cap_usd is null) = (agent_cap_approved_at is null));
comment on column public.workspaces.agent_monthly_cap_usd is 'NULL = ajan tavanı onaysız (ajan para harcayamaz). 0 = ajan harcaması kapalı.';
comment on column public.workspaces.agent_cap_approved_by is 'Tavanı veren kullanıcı (hesap açılırken sahip). Kullanıcı silinirse bağ kopar, damga kalır.';
comment on column public.workspaces.collect_every_days is 'Toplama sıklığı (gün): bundan eskiyse halka yeniden toplama ister.';
comment on column public.workspaces.collect_video_limit is 'Toplamada kendi hesap ve rakip başına son kaç video.';
comment on column public.workspaces.rival_target is 'Hedef izlenen rakip sayısı: altındaysa ve bekleyen aday yoksa rakip bulma önerilir.';

-- ── panel_jobs: ajan dayanağı yalnız onaylı tavanla ────────
-- `collect` / `discover` işinde `monthly_cap` dayanağı: çalışma alanının ajan tavanı onaylı (NULL değil) ve > 0 olmalı, iş ajan işareti
-- (`params.source = 'agent'`) taşımalı. Başka dayanaklara (one_time, onboarding, credits) ve başka türlere (ölçüm) dokunmaz.
create function private.panel_jobs_agent_cap_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cap numeric;
  v_at timestamptz;
begin
  if new.approval_basis is distinct from 'monthly_cap' or new.kind not in ('collect', 'discover') then
    return new;
  end if;
  select w.agent_monthly_cap_usd, w.agent_cap_approved_at into v_cap, v_at from public.workspaces w where w.id = new.workspace_id;
  if v_cap is null or v_at is null or v_cap <= 0 then
    raise exception 'panel_job_agent_cap_not_approved' using errcode = '23514',
      detail = 'Ajan tavanı onaylı ve 0''dan büyük değil: aylık tavan dayanağıyla toplama / rakip bulma açılamaz.';
  end if;
  if coalesce(new.params ->> 'source', '') <> 'agent' then
    raise exception 'panel_job_agent_cap_source' using errcode = '23514',
      detail = 'Aylık tavan dayanağı yalnız yönetici ajanın açtığı işte (params.source = agent) geçerlidir.';
  end if;
  return new;
end;
$$;
revoke all on function private.panel_jobs_agent_cap_guard() from public, anon, authenticated;
create trigger panel_jobs_agent_cap_guard before insert on public.panel_jobs
  for each row execute function private.panel_jobs_agent_cap_guard();

-- ── create_workspace: yeni hesaba 3 USD ajan tavanı ────────
-- 0021 tanımıyla AYNI imza ve kurallar (yetki: yalnız service role, create or replace korur); tek fark insert'e üç sütun.
create or replace function public.create_workspace(
  p_user uuid,
  p_name text,
  p_slug text,
  p_timezone text,
  p_audience_timezone text,
  p_niche_brief text,
  p_compliance_region text,
  p_platform public.platform,
  p_handle text,
  p_content_language text,
  p_account_type text
)
returns public.workspaces
language plpgsql
set search_path = ''
as $$
declare
  v_ws public.workspaces;
  v_slug text;
  v_n integer := 1;
begin
  if p_user is null or p_name is null or p_slug is null or p_platform is null or p_handle is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('own_account:' || p_user::text, 0));
  if exists (
    select 1
      from public.social_accounts sa
      join public.workspace_members m on m.workspace_id = sa.workspace_id
     where m.user_id = p_user and m.role = 'owner' and sa.platform = p_platform and sa.handle = p_handle
  ) then
    raise exception 'own_account_exists' using errcode = '23505',
      detail = format('platform=%s handle=%s', p_platform, p_handle),
      hint = 'Bu hesap bu kullanıcı için zaten ekli.';
  end if;

  v_slug := p_slug;
  while exists (select 1 from public.workspaces w where w.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := left(p_slug, 60) || '-' || v_n::text;
  end loop;

  insert into public.workspaces (name, slug, timezone, audience_timezone, niche_brief, compliance_region, content_language, account_type,
                                 agent_monthly_cap_usd, agent_cap_approved_at, agent_cap_approved_by)
  values (
    btrim(p_name),
    v_slug,
    coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'Europe/Istanbul'),
    nullif(btrim(coalesce(p_audience_timezone, '')), ''),
    nullif(btrim(coalesce(p_niche_brief, '')), ''),
    coalesce(nullif(btrim(coalesce(p_compliance_region, '')), ''), 'TR'),
    nullif(btrim(coalesce(p_content_language, '')), ''),
    coalesce(nullif(btrim(coalesce(p_account_type, '')), ''), 'business'),
    3, now(), null
  )
  returning * into v_ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws.id, p_user, 'owner');
  -- Onaylayan üyelikten sonra yazılır: olmayan kullanıcıda üyelik FK'si (workspace_members_user_id_fkey) hatayı verir.
  update public.workspaces set agent_cap_approved_by = p_user where id = v_ws.id returning * into v_ws;
  insert into public.social_accounts (workspace_id, platform, handle, connection) values (v_ws.id, p_platform, p_handle, 'scrape_only');
  insert into public.alert_settings (workspace_id) values (v_ws.id);

  return v_ws;
end;
$$;
