-- panel — 0021: başlangıç akışı sözleşmesi (plan docs/BASLANGIC-AKISI-PLAN.md §2, §3, §5 Dilim 1).
-- Şema ↔ domain: src/lib/domain/panel-job.ts (`JOB_KINDS`, `JOB_APPROVAL_BASES`) + src/lib/domain/onboarding-job.ts (aşamalar, sabit tavanlar,
-- deneme sınırları) + src/lib/domain/onboarding.ts (akış durumu: SAKLANMAZ, iş satırlarından ve veriden türetilir).
-- YALNIZ EKLEMELİ: `workspaces`'e bir NULL sütun, `panel_jobs` CHECK listelerinin GENİŞLETİLMESİ (mevcut satırların hepsi yeni kuralı da
-- sağlar), iki yeni CHECK, bir kısmi benzersiz indeks, bir INSERT trigger'ı ve `create_workspace`'in AYNI imzayla yeniden tanımı (tek fark:
-- tekillik denetimi). Mevcut satırlara dokunmaz, sütun düşürmez. Uygulama: `npx -y supabase@2.118.0 migration up --local` (db reset YOK).
--
-- ── Tasarım ────────────────────────────────────────────────
-- 1) YENİ İŞ TÜRÜ `onboarding`, İKİ AŞAMA İKİ İŞ SATIRI (`params.phase`): `probe` = "hesaba bakış" (profil + kendi son videoları + rakip
--    adayları + konu taslağı) · `build` = "ilk tur" (rakipler dahil toplama → inceleme → plan → notlar). Arada kullanıcı kararı vardır
--    (bu sen misin, tür, konu, rakipler) ve onay iş açılırken yazılıp değişmediği için tek satır olamaz.
-- 2) YENİ ONAY DAYANAĞI `onboarding`: kullanıcının akıştaki düğmesi ("Devam et" / "Başlat") SABİT tavanlı onaydır. Tutar girdiden GELMEZ:
--    sunucu aşamanın sabit tavanını yazar ve DB tam eşitlik ister (probe 0,20 USD · build 0,40 USD; toplam 0,60 USD). Bu dayanak yalnız
--    `onboarding` türünde, `onboarding` türü de yalnız bu dayanakla yazılır (ikisi birbirine kilitli).
-- 3) HESAP BAŞINA BİR KEZ: çalışma alanı başına sırada / çalışan / bitmiş (tamam ya da kısmi) TEK `build` (kısmi benzersiz indeks). Hata,
--    iptal ya da engelle biten `build` yeniden denenebilir ama deneme sayısı sınırlıdır (probe en çok 3, build en çok 2 satır; trigger).
--    `build`, başarıyla bitmiş bir `probe` olmadan yazılamaz (aşama 1 geçmeden asıl tur yok). Kısmi biten `build` yeniden açılmaz:
--    kalan iş onaysız haftalık turla ($0) sürer.
-- 4) KULLANICI BAŞINA TEKİLLİK: aynı kullanıcı aynı platform + aynı kullanıcı adını ikinci kez AÇAMAZ (`create_workspace`;
--    `own_account_exists`, 23505). Mevcut kayıtlara dokunulmaz; kural yalnız yeni açılışta denetlenir.
-- 5) "Bu sen misin?" onayı bir OLGUDUR (akış durumu değil): `workspaces.account_confirmed_at`. NULL = kullanıcı hesabı / türü henüz
--    onaylamadı. Akışın adımı bu sütun + iş satırları + veriden türetilir.

-- ── Çalışma alanı: hesap onayı ─────────────────────────────
alter table public.workspaces
  add column account_confirmed_at timestamptz;
comment on column public.workspaces.account_confirmed_at
  is 'Başlangıç akışında kullanıcının hesabı ("bu sen misin?") ve hesap türünü onayladığı an. NULL = onaylanmadı. Yazan yalnız sunucu.';

-- ── panel_jobs: tür, dayanak, kısıtlar ─────────────────────
alter table public.panel_jobs
  drop constraint panel_jobs_kind_check,
  add constraint panel_jobs_kind_check check (kind in ('routine', 'collect', 'measure', 'analyze', 'label', 'plan', 'briefing', 'onboarding')),
  drop constraint panel_jobs_approval_basis_check,
  add constraint panel_jobs_approval_basis_check check (approval_basis in ('one_time', 'monthly_cap', 'onboarding', 'credits')),
  -- KISIT 1 — onaysız (USD) harcama satırı yazılamaz: başlangıç işi de onaysız yazılamaz (kredi onayı yetmez).
  drop constraint panel_jobs_spend_needs_approval,
  add constraint panel_jobs_spend_needs_approval check (dry_run or kind not in ('collect', 'measure', 'onboarding') or (approval_basis is not null and approval_basis <> 'credits')),
  -- KISIT 2 — USD onayı yalnız harcayabilen türde; kredi onayı her türde; ikisi de yalnız gerçek koşuda.
  drop constraint panel_jobs_approval_scope,
  add constraint panel_jobs_approval_scope check (approval_basis is null or (not dry_run and (approval_basis = 'credits' or kind in ('collect', 'measure', 'routine', 'onboarding')))),
  -- `onboarding` dayanağı ↔ `onboarding` türü birbirine kilitli (NULL dayanak "onboarding değil" sayılır).
  add constraint panel_jobs_onboarding_basis check ((approval_basis is not distinct from 'onboarding') = (kind = 'onboarding')),
  -- Başlangıç işinin şekli: önizleme yok, aşama listeden, tutar aşamanın SABİT tavanı (girdiden gelmez), kredi tavanı aşamanınkini aşamaz.
  -- (NULL karşılaştırması CHECK'i geçirirdi: bu yüzden `coalesce` / `is not distinct from`.)
  add constraint panel_jobs_onboarding_shape check (
    kind <> 'onboarding'
    or (
      not dry_run
      and coalesce(params ->> 'phase', '') in ('probe', 'build')
      and approved_max_usd is not distinct from (case params ->> 'phase' when 'probe' then 0.20 else 0.40 end)::numeric
      and coalesce(approved_max_credits, 0) <= (case params ->> 'phase' when 'probe' then 10 else 300 end)
    )
  );
comment on constraint panel_jobs_onboarding_shape on public.panel_jobs
  is 'Başlangıç işi: aşama probe/build, önizleme yok, tutar aşamanın sabit tavanı (probe 0,20 · build 0,40 USD), kredi tavanı probe 10 · build 300.';
comment on constraint panel_jobs_spend_needs_approval on public.panel_jobs
  is 'Onaysız harcama yok: collect/measure/onboarding işi kuru koşu değilse USD onayı ister; kredi onayı yetmez.';

-- KURAL 3 — hesap (çalışma alanı) başına TEK ilk tur: sırada, çalışan ya da bitmiş (tamam / kısmi) `build`.
create unique index panel_jobs_one_onboarding_build on public.panel_jobs (workspace_id)
  where kind = 'onboarding' and params ->> 'phase' = 'build' and status in ('queued', 'running', 'succeeded', 'partial');

-- ── Başlangıç işi koruması (yalnız INSERT) ─────────────────
-- Deneme sınırı (aşama başına satır sayısı: probe 3, build 2; iptal / hata dahil HER satır sayılır) ve "bakış bitmeden ilk tur yok".
-- Hata kodu 23514, ileti `panel_job_onboarding_*` (depo `invalid_state`'e çevirir). Her rol için geçerlidir (service role dahil).
create function private.panel_jobs_onboarding_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_phase text := new.params ->> 'phase';
  v_count integer;
begin
  if new.kind <> 'onboarding' then
    return new;
  end if;
  select count(*) into v_count
    from public.panel_jobs j
   where j.workspace_id = new.workspace_id and j.kind = 'onboarding' and j.params ->> 'phase' = v_phase;
  if v_count >= (case v_phase when 'probe' then 3 else 2 end) then
    raise exception 'panel_job_onboarding_limit' using errcode = '23514',
      detail = format('phase=%s attempts=%s', v_phase, v_count),
      hint = 'Bu hesap için bu aşama en çok bu kadar kez denenebilir.';
  end if;
  if v_phase = 'build' and not exists (
    select 1
      from public.panel_jobs j
     where j.workspace_id = new.workspace_id
       and j.kind = 'onboarding'
       and j.params ->> 'phase' = 'probe'
       and j.status in ('succeeded', 'partial')
  ) then
    raise exception 'panel_job_onboarding_needs_probe' using errcode = '23514',
      detail = 'İlk tur, hesaba bakış başarıyla bitmeden başlatılamaz.';
  end if;
  return new;
end;
$$;
revoke all on function private.panel_jobs_onboarding_guard() from public, anon, authenticated;
create trigger panel_jobs_onboarding_guard before insert on public.panel_jobs
  for each row execute function private.panel_jobs_onboarding_guard();

-- ── create_workspace: kullanıcı başına tekillik ────────────
-- 0015'teki 11 parametreli tanımla AYNI imza ve davranış; tek fark baştaki tekillik denetimi: `p_user`'ın SAHİBİ olduğu bir çalışma
-- alanında aynı platform + aynı kullanıcı adı varsa `own_account_exists` (23505 → depo `already_exists`). Aynı kullanıcının eşzamanlı iki
-- isteği advisory kilitle sıraya girer. 10 ve 9 parametreli eski imzalar buna devrettiği için aynı kural onlarda da geçerlidir.
-- Mevcut (bu kuraldan önce açılmış) yinelenen kayıtlara dokunulmaz. Yetkiler korunur (CREATE OR REPLACE izinlere dokunmaz).
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

  insert into public.workspaces (name, slug, timezone, audience_timezone, niche_brief, compliance_region, content_language, account_type)
  values (
    btrim(p_name),
    v_slug,
    coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'Europe/Istanbul'),
    nullif(btrim(coalesce(p_audience_timezone, '')), ''),
    nullif(btrim(coalesce(p_niche_brief, '')), ''),
    coalesce(nullif(btrim(coalesce(p_compliance_region, '')), ''), 'TR'),
    nullif(btrim(coalesce(p_content_language, '')), ''),
    coalesce(nullif(btrim(coalesce(p_account_type, '')), ''), 'business')
  )
  returning * into v_ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws.id, p_user, 'owner');
  insert into public.social_accounts (workspace_id, platform, handle, connection) values (v_ws.id, p_platform, p_handle, 'scrape_only');
  insert into public.alert_settings (workspace_id) values (v_ws.id);

  return v_ws;
end;
$$;
