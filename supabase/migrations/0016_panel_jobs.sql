-- panel — 0016: panel iş kuyruğu (`panel_jobs`). Panelden başlatılan işler: haftalık tur, toplama, ölçüm, video inceleme,
-- açı etiketleme, plan, notlar. Şema ↔ domain eşlemesi: src/lib/domain/panel-job.ts (`PanelJob`); jsonb sütunların zod sözleşmesi
-- src/lib/data/job-schema.ts (yazan işçi ve okuyan depo AYNI şema). Plan: docs/PANEL-KONTROL-PLAN.md §2.
-- YALNIZ EKLEMELİ (yeni tablo + yeni fonksiyonlar); mevcut satırlara dokunmaz. Uygulama: `npx -y supabase@2.118.0 migration up --local`.
--
-- `collection_runs` ile KARIŞMAZ: o, sağlayıcı çağrısı defteridir (bir iş onlarca koşu açar); bu tablo işin kendisidir. `publish_jobs`
-- (yayın işi) ile de karışmaz. v1'de koşu ↔ iş bağı yoktur.
--
-- DB'nin tuttuğu kurallar (hangi yoldan yazılırsa yazılsın):
--   1) ONAYSIZ HARCAMA SATIRI YAZILAMAZ: `collect`/`measure` işi kuru koşu değilse onay kaydı ister (CHECK).
--   2) Onay kaydı yalnız harcayabilen türde (`collect`/`measure`/`routine`) ve gerçek koşuda olur; ya tamdır ya yoktur; `one_time` tutar
--      ister (CHECK). Onaylayan, çalışma alanının sahip/editör üyesidir (trigger; yayın onayıyla aynı kural).
--   3) Çalışma alanı başına TEK etkin iş (kısmi benzersiz indeks).
--   4) Kimlik ve onay alanları sonradan DEĞİŞMEZ, bitmiş iş donar, durum geri dönmez (trigger): onaysız iş sonradan onaylı yapılamaz,
--      zombi işçi bitmiş işin üstüne yazamaz.
--   5) Kuyrukta tek işçi: `claim_panel_job` taze nabızlı `running` varken iş vermez (advisory kilit; `reserve_budget` deseni).
-- Yeni tür / durum / onay dayanağı = bu CHECK listeleri + src/lib/domain/panel-job.ts BİRLİKTE genişler.

create table public.panel_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Kuyruk adı: canlı işçi yalnız `panel` kuyruğunu alır; testler kendi kuyruk adını kullanır (açık bir işçi test işini almasın).
  queue text not null default 'panel' check (queue ~ '^[a-z][a-z0-9_-]{0,39}$'),
  kind text not null check (kind in ('routine', 'collect', 'measure', 'analyze', 'label', 'plan', 'briefing')),
  -- Kuru koşu ("önce bak"): $0, yazma/LLM/Apify yok; yalnız önizlemesi olan türlerde.
  dry_run boolean not null default false,
  -- Para DIŞI parametreler ({ limit?, week? }; zod: jobParamsSchema). Harcama tavanı burada DEĞİL, `approved_max_usd`'dedir.
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'partial', 'blocked', 'failed', 'cancelled')),
  -- Harcama onayı. one_time = bu iş için açık tutar · monthly_cap = çalışma alanının onaylı aylık tavanı içinde · NULL = onay yok.
  approval_basis text check (approval_basis in ('one_time', 'monthly_cap')),
  -- Onaylı tek seferlik üst sınır (USD). İşçi harcama tavanını YALNIZ buradan okur. Üst sınır 2 USD (`JOB_SPEND_MAX_USD`).
  approved_max_usd numeric(12, 6) check (approved_max_usd > 0 and approved_max_usd <= 2),
  -- Onay kaydı: onaylayan kullanıcı + an. Denetim izi için kullanıcı silinemez (RESTRICT; yayın onayı deseni).
  approved_by uuid references auth.users (id) on delete restrict,
  approved_at timestamptz,
  -- Adım listesi ([{ id, status, note?, code?, seconds?, spend? }]; zod: jobStepsSchema). İşçi her adımda günceller.
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  current_step text check (current_step ~ '^[a-z][a-z0-9_]{0,39}$'),
  -- Adım içi sayaç ({ done, total }; ör. analizde video sayacı). NULL = sayaç yok (0/0 değil).
  progress jsonb check (jsonb_typeof(progress) = 'object'),
  -- Günlüğün son satırları (yalnız yönetici görür; sınırlı; eskiyince NULL'a çekilir).
  log_tail text check (char_length(log_tail) <= 8000),
  -- Sonuç ({ outcome?, exitCode?, estimate?, spend?, reportPath? }; zod: jobResultSchema). `outcome` bilinen sonuç kodudur.
  result jsonb check (jsonb_typeof(result) = 'object'),
  -- Teknik hata metni (yalnız yönetici görür).
  error text check (char_length(error) <= 2000),
  -- İşi alan işçi (claim'de yazılır, sonra değişmez). Çit: işçinin her yazımı `where id and worker_id and status = 'running'`.
  worker_id text check (worker_id ~ '^[A-Za-z0-9._:-]{1,80}$'),
  heartbeat_at timestamptz,
  cancel_requested_at timestamptz,
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,

  constraint panel_jobs_tenant_key unique (id, workspace_id),
  -- Önizlemesi olmayan türde kuru koşu yoktur.
  constraint panel_jobs_dry_run_kind check (not dry_run or kind in ('routine', 'collect', 'measure')),
  -- KISIT 1 — onaysız harcama satırı yazılamaz.
  constraint panel_jobs_spend_needs_approval check (dry_run or kind not in ('collect', 'measure') or approval_basis is not null),
  -- KISIT 2 — onay yalnız harcayabilen türde ve gerçek koşuda; kayıt ya tam ya yok; tek seferlik onay tutar ister.
  constraint panel_jobs_approval_scope check (approval_basis is null or (not dry_run and kind in ('collect', 'measure', 'routine'))),
  constraint panel_jobs_approval_record check (
    (approval_basis is null and approved_max_usd is null and approved_by is null and approved_at is null)
    or (approval_basis is not null and approved_by is not null and approved_at is not null)
  ),
  constraint panel_jobs_one_time_amount check (approval_basis is distinct from 'one_time' or approved_max_usd is not null),
  -- Durum ↔ alan tutarlılığı: sıradaki işe işçi dokunmamıştır, çalışan işin işçisi ve nabzı vardır, biten işin bitiş anı vardır.
  constraint panel_jobs_queued_shape check (
    status <> 'queued'
    or (worker_id is null and started_at is null and heartbeat_at is null and finished_at is null and cancel_requested_at is null)
  ),
  constraint panel_jobs_running_shape check (
    status <> 'running' or (worker_id is not null and started_at is not null and heartbeat_at is not null and finished_at is null)
  ),
  constraint panel_jobs_finished_shape check (status in ('queued', 'running') or finished_at is not null)
);
comment on table public.panel_jobs is 'Panel iş kuyruğu: panelden başlatılan işler (haftalık tur, toplama, ölçüm, analiz, etiket, plan, notlar). Yazan yalnız sunucu.';
comment on constraint panel_jobs_spend_needs_approval on public.panel_jobs
  is 'Onaysız harcama yok: collect/measure işi kuru koşu değilse onay kaydı ister.';
comment on column public.panel_jobs.approved_max_usd is 'Onaylı tek seferlik üst sınır (USD). NULL = tutar verilmedi (0 değil); monthly_cap dayanağında tavan çalışma alanındadır.';
comment on column public.panel_jobs.progress is 'NULL = sayaç yok (0/0 değil).';

-- KURAL 3 — çalışma alanı başına tek etkin iş.
create unique index panel_jobs_one_active_per_workspace on public.panel_jobs (workspace_id) where status in ('queued', 'running');
-- claim: kuyruğun en eski sıradaki işi; kuyruğun çalışan işi.
create index panel_jobs_queued_idx on public.panel_jobs (queue, created_at, id) where status = 'queued';
create index panel_jobs_running_idx on public.panel_jobs (queue) where status = 'running';
-- listJobs: çalışma alanının işleri, yeniden eskiye.
create index panel_jobs_workspace_created_idx on public.panel_jobs (workspace_id, created_at desc);
-- approved_by / requested_by FK aramaları.
create index panel_jobs_approved_by_idx on public.panel_jobs (approved_by) where approved_by is not null;
create index panel_jobs_requested_by_idx on public.panel_jobs (requested_by) where requested_by is not null;
alter table public.panel_jobs enable row level security;

-- ── Koruma trigger'ı (KURAL 2 üyelik + KURAL 4) ────────────
-- Her rol için geçerlidir (service role dahil). Hata kodu 23514, ileti `panel_job_*` (depo `invalid_state`'e çevirir).
create function private.panel_jobs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.approved_by is not null and not exists (
      select 1
        from public.workspace_members m
       where m.workspace_id = new.workspace_id
         and m.user_id = new.approved_by
         and m.role in ('owner', 'editor')
    ) then
      raise exception 'panel_job_approver_not_editor' using errcode = '23514',
        detail = 'Harcamayı onaylayan bu çalışma alanının editör/sahip üyesi olmalı.';
    end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------
  if new.workspace_id is distinct from old.workspace_id
     or new.queue is distinct from old.queue
     or new.kind is distinct from old.kind
     or new.dry_run is distinct from old.dry_run
     or new.params is distinct from old.params
     or new.created_at is distinct from old.created_at then
    raise exception 'panel_job_identity_immutable' using errcode = '23514',
      detail = 'İşin çalışma alanı, kuyruğu, türü, kuru koşu bayrağı ve parametreleri sonradan değişmez.';
  end if;
  if new.approval_basis is distinct from old.approval_basis
     or new.approved_max_usd is distinct from old.approved_max_usd
     or new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at then
    raise exception 'panel_job_approval_immutable' using errcode = '23514',
      detail = 'Onay kaydı yalnız iş açılırken yazılır; onaysız iş sonradan onaylanamaz, tutar değiştirilemez.';
  end if;

  -- Bitmiş iş donar: yalnız günlük kuyruğu silinebilir (log_tail → NULL) ve isteyen kullanıcı silinince bağ kopar (FK set null).
  if old.status not in ('queued', 'running') then
    if (to_jsonb(new) - array['log_tail', 'requested_by']) is distinct from (to_jsonb(old) - array['log_tail', 'requested_by'])
       or (new.log_tail is not null and new.log_tail is distinct from old.log_tail) then
      raise exception 'panel_job_finished' using errcode = '23514',
        detail = format('%s durumundaki iş değiştirilemez.', old.status);
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'queued' and new.status not in ('running', 'cancelled', 'failed') then
      raise exception 'panel_job_invalid_transition' using errcode = '23514',
        detail = format('queued → %s geçişi yok (yalnız running, cancelled, failed).', new.status);
    end if;
    if old.status = 'running' and new.status = 'queued' then
      raise exception 'panel_job_invalid_transition' using errcode = '23514',
        detail = 'Çalışan iş sıraya geri alınamaz (yarıda kalan iş kendiliğinden yeniden koşmaz).';
    end if;
  end if;
  -- İşi alan işçi ve başlangıç anı bir kez yazılır.
  if old.worker_id is not null
     and (new.worker_id is distinct from old.worker_id or new.started_at is distinct from old.started_at) then
    raise exception 'panel_job_claim_immutable' using errcode = '23514',
      detail = 'İşi alan işçi ve başlangıç anı sonradan değişmez.';
  end if;
  -- İptal isteği geri alınamaz.
  if old.cancel_requested_at is not null and new.cancel_requested_at is distinct from old.cancel_requested_at then
    raise exception 'panel_job_cancel_immutable' using errcode = '23514',
      detail = 'İptal isteği geri alınamaz.';
  end if;
  return new;
end;
$$;
revoke all on function private.panel_jobs_guard() from public, anon, authenticated;
create trigger panel_jobs_guard before insert or update on public.panel_jobs
  for each row execute function private.panel_jobs_guard();

-- ── Yetim iş (işçisi kaybolmuş) ────────────────────────────
-- Nabız 10 sn'de bir atar; bu süreden eski nabızlı `running` iş "yanıt vermiyor"dur (`JOB_STALE_AFTER_MS`, domain ile AYNI değer).
create function private.panel_job_stale_after()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '90 seconds' $$;
revoke all on function private.panel_job_stale_after() from public, anon, authenticated;
grant execute on function private.panel_job_stale_after() to service_role;

-- Yetim işleri kapatır (`failed`, sonuç kodu `worker_lost`). Kendiliğinden çalışmaz: yalnız yeni iş isteği, claim ve iptal anında
-- çağrılır (uyku/kapak sonrası yanlış kapatma olmasın). p_ws / p_queue NULL = süzme yok. Kapatılan iş sayısını döndürür.
create function private.close_stale_panel_jobs(p_ws uuid, p_queue text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.panel_jobs j
     set status = 'failed',
         finished_at = now(),
         error = 'worker_lost: işçi yanıt vermedi (son nabız '
           || to_char(j.heartbeat_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || ')',
         result = jsonb_set(coalesce(j.result, '{}'::jsonb), '{outcome}', '"worker_lost"'::jsonb)
   where j.status = 'running'
     and j.heartbeat_at < now() - private.panel_job_stale_after()
     and (p_ws is null or j.workspace_id = p_ws)
     and (p_queue is null or j.queue = p_queue);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function private.close_stale_panel_jobs(uuid, text) from public, anon, authenticated;
grant execute on function private.close_stale_panel_jobs(uuid, text) to service_role;

-- ── İş isteği ──────────────────────────────────────────────
-- Çalışma alanının yetim işini kapatır, sonra yeni işi `queued` yazar. Çalışma alanında etkin iş varsa `panel_job_active`
-- (23505 → depo `already_exists`). Onay dayanağı verildiyse onaylayan = p_user, an = now(). Kısıtlar girdiyi DB'de yeniden doğrular
-- (onaysız harcama → 23514 `panel_jobs_spend_needs_approval`). Kuyruk boşsa `panel`.
create function public.request_panel_job(
  p_ws uuid,
  p_queue text,
  p_kind text,
  p_dry_run boolean,
  p_params jsonb,
  p_approval_basis text,
  p_approved_max_usd numeric,
  p_user uuid
)
returns public.panel_jobs
language plpgsql
set search_path = ''
as $$
declare
  v_basis text := nullif(btrim(coalesce(p_approval_basis, '')), '');
  v_active uuid;
  v_job public.panel_jobs;
begin
  if p_ws is null or p_kind is null or p_dry_run is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  -- Aynı çalışma alanına eşzamanlı iki istek sıraya girer: ikincisi birincinin etkin işini görür.
  perform pg_advisory_xact_lock(hashtextextended('panel_job:' || p_ws::text, 0));
  if not exists (select 1 from public.workspaces w where w.id = p_ws) then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  perform private.close_stale_panel_jobs(p_ws, null);

  select j.id into v_active
    from public.panel_jobs j
   where j.workspace_id = p_ws and j.status in ('queued', 'running')
   limit 1;
  if found then
    raise exception 'panel_job_active' using errcode = '23505',
      detail = format('active=%s', v_active),
      hint = 'Çalışma alanında zaten sırada ya da çalışan bir iş var; bitmesini bekle ya da durdur.';
  end if;

  insert into public.panel_jobs (
    workspace_id, queue, kind, dry_run, params, approval_basis, approved_max_usd, approved_by, approved_at, requested_by
  )
  values (
    p_ws,
    coalesce(nullif(btrim(coalesce(p_queue, '')), ''), 'panel'),
    p_kind,
    p_dry_run,
    coalesce(p_params, '{}'::jsonb),
    v_basis,
    p_approved_max_usd,
    case when v_basis is null then null else p_user end,
    case when v_basis is null then null else now() end,
    p_user
  )
  returning * into v_job;
  return v_job;
end;
$$;
revoke all on function public.request_panel_job(uuid, text, text, boolean, jsonb, text, numeric, uuid) from public, anon, authenticated;
grant execute on function public.request_panel_job(uuid, text, text, boolean, jsonb, text, numeric, uuid) to service_role;

-- ── İşi al (işçi) ──────────────────────────────────────────
-- Kuyruğun yetim işlerini kapatır; kuyrukta taze nabızlı `running` varsa iş VERMEZ (kuyrukta tek işçi); yoksa en eski sıradaki işi
-- `running` yapar (işçi, başlangıç, nabız) ve döndürür. İş yoksa boş küme. Eşzamanlı iki claim: advisory kilit ikinciyi bekletir,
-- ikinci birincinin çalışan işini görür ve iş alamaz (tek kazanan).
create function public.claim_panel_job(p_queue text, p_worker_id text)
returns setof public.panel_jobs
language plpgsql
set search_path = ''
as $$
declare
  v_queue text := coalesce(nullif(btrim(coalesce(p_queue, '')), ''), 'panel');
  v_worker text := nullif(btrim(coalesce(p_worker_id, '')), '');
  v_id uuid;
begin
  if v_worker is null then
    raise exception 'invalid_argument' using errcode = '22023', detail = 'p_worker_id zorunlu';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('claim_panel_job:' || v_queue, 0));
  perform private.close_stale_panel_jobs(null, v_queue);

  if exists (select 1 from public.panel_jobs j where j.queue = v_queue and j.status = 'running') then
    return;
  end if;

  select j.id into v_id
    from public.panel_jobs j
   where j.queue = v_queue and j.status = 'queued'
   order by j.created_at, j.id
   limit 1
   for update skip locked;
  if not found then
    return;
  end if;

  return query
    update public.panel_jobs j
       set status = 'running', worker_id = v_worker, started_at = now(), heartbeat_at = now()
     where j.id = v_id and j.status = 'queued'
    returning j.*;
end;
$$;
revoke all on function public.claim_panel_job(text, text) from public, anon, authenticated;
grant execute on function public.claim_panel_job(text, text) to service_role;

-- ── İptal ──────────────────────────────────────────────────
-- Sıradaki iş: anında `cancelled`. Çalışan iş: `cancel_requested_at` yazılır (işçi adım / video sınırında durur; yapılan iş kalır);
-- tekrar çağrı ilk isteğin anını korur. Yanıt vermeyen (yetim) çalışan iş: `failed` / `worker_lost` olarak kapanır.
-- Bitmiş iş: `panel_job_finished` (23514 → depo `invalid_state`). İş yok ya da başka çalışma alanında: `panel_job_not_found` (P0002).
create function public.cancel_panel_job(p_ws uuid, p_job uuid)
returns public.panel_jobs
language plpgsql
set search_path = ''
as $$
declare
  v_job public.panel_jobs;
begin
  if p_ws is null or p_job is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  select j.* into v_job
    from public.panel_jobs j
   where j.id = p_job and j.workspace_id = p_ws
     for update;
  if not found then
    raise exception 'panel_job_not_found' using errcode = 'P0002';
  end if;

  if v_job.status = 'queued' then
    update public.panel_jobs j
       set status = 'cancelled', cancel_requested_at = now(), finished_at = now()
     where j.id = p_job
    returning j.* into v_job;
  elsif v_job.status = 'running' then
    if v_job.heartbeat_at < now() - private.panel_job_stale_after() then
      perform private.close_stale_panel_jobs(p_ws, null);
      select j.* into v_job from public.panel_jobs j where j.id = p_job;
    else
      update public.panel_jobs j
         set cancel_requested_at = coalesce(j.cancel_requested_at, now())
       where j.id = p_job
      returning j.* into v_job;
    end if;
  else
    raise exception 'panel_job_finished' using errcode = '23514',
      detail = format('%s durumundaki iş iptal edilemez.', v_job.status);
  end if;
  return v_job;
end;
$$;
revoke all on function public.cancel_panel_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_panel_job(uuid, uuid) to service_role;

-- ── Yetki + RLS ────────────────────────────────────────────
-- 0006/0012 deseni: istemci rollerine varsayılan yetki kapalı; yazan yalnız sunucu (service role), üyeler okur. Üye YALNIZ durum
-- sütunlarını okur (durum şeridi): adım notu, günlük, hata, sonuç, parametre ve onay/tutar sütunları yönetici bilgisidir, sütun
-- yetkisiyle kapalıdır (Supabase Auth gelince müşteri üyeliği doğrudan PostgREST'ten bunları okuyamasın).
grant all on public.panel_jobs to service_role;
grant select (
  id, workspace_id, queue, kind, dry_run, status, current_step, progress, heartbeat_at, cancel_requested_at,
  created_at, started_at, finished_at
) on public.panel_jobs to authenticated;

create policy "panel_jobs: üye okur" on public.panel_jobs
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
