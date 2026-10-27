-- panel — 0020: panel işlerinin kredi defterine bağlanması (plan docs/KREDI-PLAN.md §4, §6; Dilim 3).
-- Şema ↔ domain: src/lib/domain/panel-job.ts (`JOB_APPROVAL_BASES`, `JobApproval.maxCredits`) + src/lib/domain/job-credits.ts.
-- YALNIZ EKLEMELİ: `panel_jobs`'a bir NULL sütun, üç CHECK'in GENİŞLETİLMESİ (yeni dayanak; mevcut satırların hepsi yeni kuralı da sağlar),
-- yeni fonksiyonlar ve mevcut fonksiyonların AYNI imzayla yeniden tanımı. Mevcut satırlara dokunmaz, sütun düşürmez.
-- Uygulama: `npx -y supabase@2.118.0 migration up --local`.
--
-- KREDİ ZORLAMASI BİR SUNUCU AYARIDIR (`CREDITS_ENFORCED`, varsayılan KAPALI; okuma `src/lib/credits/enforcement.ts`). Kapalıyken depo
-- kredi parametresi göndermez: bu dosyadaki yollar bugünkü davranışla birebir aynı çalışır (ayırma yok, onay sütunu NULL).
--
-- ── Tasarım ────────────────────────────────────────────────
-- 1) AYIRMA İSTEKLE ATOMİKTİR: `request_panel_job_credited` iş satırını yazar ve AYNI transaction'da `reserve_credits` ile en çok krediyi
--    ayırır. Kredi yetmezse (`insufficient_credits`) transaction geri alınır: iş satırı da yazılmaz. "İş kuyrukta ama kredisi ayrılmamış,
--    işçi aldı" penceresi YOKTUR (işçi yalnız commit edilmiş, ayırması yapılmış işi görür). Ayırma anahtarı `job:<iş kimliği>`.
-- 2) KREDİ ONAYI ≠ USD ONAYI. `approved_max_credits` işin kredi tavanıdır (iş açılırken yazılır, sonra değişmez). `approval_basis`:
--      · `one_time` / `monthly_cap` = USD (Apify) onayı: toplama / ölçüm için HÂLÂ zorunludur (KISIT 1 yalnız bu ikisini kabul eder).
--      · `credits` = yalnız kredi onayı var, USD onayı YOK: iş kredi harcar ama Apify'a para harcatamaz.
--    USD onaylı işte kredi tavanı da varsa ikisi birlikte durur (dayanak USD'ninki kalır, `approved_max_credits` dolu olur).
-- 3) YETİM AYIRMA KALMAZ: işi SQL tarafında kapatan her yol (yetim iş → `worker_lost`; sıradaki işin iptali) aynı transaction'da o işin
--    açık ayırmasını da BIRAKIR (işçi kaybında ve başlamamış işte kredi düşülmez). Çalışan işi işçi kapatır: yapılan birim kadar düşer.
--    İşçinin kapatamadığı (bitiş yazıldı, kesinleştirme yazılamadı) ayırmayı `sweep_panel_job_credits` kapatır: işin sonucunda yazılı
--    borç (`result.credits.due`) varsa onu düşer, yoksa bırakır.

-- ── Sütun + kısıtlar ───────────────────────────────────────
alter table public.panel_jobs
  -- Onaylı kredi tavanı (iş bundan fazla kredi harcayamaz). Üst sınır `CREDIT_HOLD_MAX` (domain/credits.ts) ile aynı.
  add column approved_max_credits integer check (approved_max_credits > 0 and approved_max_credits <= 100000),
  drop constraint panel_jobs_approval_basis_check,
  add constraint panel_jobs_approval_basis_check check (approval_basis in ('one_time', 'monthly_cap', 'credits')),
  -- KISIT 1 — onaysız (USD) harcama satırı yazılamaz: kredi onayı USD onayının yerine GEÇMEZ. (NULL dayanak `in (...)` ile NULL verir ve
  -- CHECK'i geçerdi: bu yüzden açıkça "dolu ve credits değil" yazılır.)
  drop constraint panel_jobs_spend_needs_approval,
  add constraint panel_jobs_spend_needs_approval check (dry_run or kind not in ('collect', 'measure') or (approval_basis is not null and approval_basis <> 'credits')),
  -- KISIT 2 — USD onayı yalnız harcayabilen türde; kredi onayı her türde; ikisi de yalnız gerçek koşuda.
  drop constraint panel_jobs_approval_scope,
  add constraint panel_jobs_approval_scope check (approval_basis is null or (not dry_run and (approval_basis = 'credits' or kind in ('collect', 'measure', 'routine')))),
  -- Kredi tavanı onay kaydıyla birlikte durur; yalnız-kredi dayanağı tavan ister ve USD tutarı taşımaz.
  add constraint panel_jobs_credit_approval check (
    (approved_max_credits is null or approval_basis is not null)
    and (approval_basis is distinct from 'credits' or (approved_max_credits is not null and approved_max_usd is null))
  );
comment on column public.panel_jobs.approved_max_credits is 'Onaylı kredi tavanı. NULL = iş krediye bağlı değil (zorlama kapalıyken ya da kredi harcamayan iş).';
comment on constraint panel_jobs_spend_needs_approval on public.panel_jobs
  is 'Onaysız harcama yok: collect/measure işi kuru koşu değilse USD onayı (one_time / monthly_cap) ister; kredi onayı yetmez.';

-- ── Koruma trigger'ı: kredi tavanı da değişmez ─────────────
-- 0016'daki tanımla AYNI kurallar; tek fark onay değişmezliğine `approved_max_credits`'in eklenmesi.
create or replace function private.panel_jobs_guard()
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
     or new.approved_max_credits is distinct from old.approved_max_credits
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

-- ── İşin açık ayırmasını bırak ─────────────────────────────
-- İşi SQL tarafında kapatan yollar çağırır (yetim iş, sıradaki işin iptali). Düşmeden bırakır; bırakılan ayırma sayısını döndürür.
create function private.release_panel_job_credits(p_job uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_key text;
  v_count integer := 0;
begin
  for v_key in
    select h.idempotency_key from public.credit_holds h where h.panel_job_id = p_job and h.status = 'open'
  loop
    perform public.release_credits(v_key);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.release_panel_job_credits(uuid) from public, anon, authenticated;
grant execute on function private.release_panel_job_credits(uuid) to service_role;

-- ── Yetim iş kapatma: ayırma da bırakılır ──────────────────
-- 0016'daki tanımla AYNI imza ve kapatma kuralı; tek fark kapatılan her işin açık kredi ayırmasının aynı transaction'da bırakılması
-- (işçi kaybında kredi düşülmez; "işi bitmiş ama ayırması açık" kayıt kalmaz).
create or replace function private.close_stale_panel_jobs(p_ws uuid, p_queue text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
begin
  with closed as (
    update public.panel_jobs j
       set status = 'failed',
           finished_at = now(),
           error = 'worker_lost: işçi yanıt vermedi (son nabız '
             || to_char(j.heartbeat_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || ')',
           result = jsonb_set(coalesce(j.result, '{}'::jsonb), '{outcome}', '"worker_lost"'::jsonb)
     where j.status = 'running'
       and j.heartbeat_at < now() - private.panel_job_stale_after()
       and (p_ws is null or j.workspace_id = p_ws)
       and (p_queue is null or j.queue = p_queue)
    returning j.id
  )
  select coalesce(array_agg(c.id), '{}'::uuid[]) into v_ids from closed c;

  foreach v_id in array v_ids loop
    perform private.release_panel_job_credits(v_id);
  end loop;
  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

-- ── İş isteği (kredi ayırmalı) ─────────────────────────────
-- `request_panel_job` (0016) ile AYNI kurallar + isteğe bağlı kredi: `p_max_credits` verilirse iş satırıyla AYNI transaction'da
-- `p_credit_owner`'ın hesabından o kadar kredi ayrılır (anahtar `job:<iş kimliği>`). Kredi yetmezse `insufficient_credits` (P0001) ve iş
-- satırı da YAZILMAZ. USD onayı yoksa dayanak `credits` olur; varsa dayanak USD'ninki kalır ve kredi tavanı yanına yazılır.
-- `p_max_credits` NULL = krediye bağlı değil (zorlama kapalı ya da kredi harcamayan iş): 0016 davranışı birebir.
create function public.request_panel_job_credited(
  p_ws uuid,
  p_queue text,
  p_kind text,
  p_dry_run boolean,
  p_params jsonb,
  p_approval_basis text,
  p_approved_max_usd numeric,
  p_user uuid,
  p_credit_owner uuid default null,
  p_max_credits integer default null
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
  if v_basis = 'credits' then
    -- `credits` dayanağı girdiden gelmez: yalnız kredi tavanı verilip USD onayı verilmediğinde burada türetilir.
    raise exception 'invalid_argument' using errcode = '22023', detail = 'credits dayanağı doğrudan verilemez.';
  end if;
  if p_max_credits is not null then
    if p_credit_owner is null or p_max_credits <= 0 or p_dry_run then
      raise exception 'invalid_argument' using errcode = '22023', detail = 'Kredi tavanı: hesap sahibi, pozitif tutar ve gerçek koşu ister.';
    end if;
    v_basis := coalesce(v_basis, 'credits');
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
    workspace_id, queue, kind, dry_run, params, approval_basis, approved_max_usd, approved_max_credits, approved_by, approved_at, requested_by
  )
  values (
    p_ws,
    coalesce(nullif(btrim(coalesce(p_queue, '')), ''), 'panel'),
    p_kind,
    p_dry_run,
    coalesce(p_params, '{}'::jsonb),
    v_basis,
    p_approved_max_usd,
    p_max_credits,
    case when v_basis is null then null else p_user end,
    case when v_basis is null then null else now() end,
    p_user
  )
  returning * into v_job;

  -- Ayırma iş satırıyla AYNI transaction'dadır: yetmezse hata bütün transaction'ı (iş satırını da) geri alır.
  if p_max_credits is not null then
    perform public.reserve_credits(p_credit_owner, p_max_credits, 'job:' || v_job.id::text, p_ws, v_job.id, null);
  end if;
  return v_job;
end;
$$;
revoke all on function public.request_panel_job_credited(uuid, text, text, boolean, jsonb, text, numeric, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.request_panel_job_credited(uuid, text, text, boolean, jsonb, text, numeric, uuid, uuid, integer) to service_role;

-- Eski giriş (0016) AYNI imza ve davranışla kalır: kredisiz istek olarak yeni fonksiyona devreder (kural tek yerde).
create or replace function public.request_panel_job(
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
language sql
set search_path = ''
as $$
  select * from public.request_panel_job_credited(p_ws, p_queue, p_kind, p_dry_run, p_params, p_approval_basis, p_approved_max_usd, p_user, null, null)
$$;

-- ── İptal: sıradaki işin ayırması bırakılır ────────────────
-- 0016'daki tanımla AYNI imza ve kurallar; tek fark sıradaki iş iptal edilince açık kredi ayırmasının bırakılması (iş hiç başlamadı:
-- kredi düşülmez). Yanıt vermeyen çalışan işi `close_stale_panel_jobs` kapatır (o da bırakır). Canlı çalışan işte yalnız istek yazılır:
-- ayırmayı işçi kapatır (yapılan birim kadar düşer).
create or replace function public.cancel_panel_job(p_ws uuid, p_job uuid)
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
    perform private.release_panel_job_credits(p_job);
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

-- ── Süpürme: işi bitmiş, ayırması açık ─────────────────────
-- İşçi başında, YALNIZ kendi kuyruğu için çağrılır. İşi bitmiş (sırada / çalışıyor DEĞİL) ama ayırması açık kalmış kayıtları kapatır:
-- işin sonucunda yazılı borç (`result.credits.due`: işçinin hesapladığı, kesinleştiremediği tutar) geçerliyse O düşülür, değilse ayırma
-- bırakılır. Kapatılan ayırma sayısını döndürür. İdempotenttir (kapanmış ayırmaya dokunmaz).
create function public.sweep_panel_job_credits(p_queue text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_queue text := coalesce(nullif(btrim(coalesce(p_queue, '')), ''), 'panel');
  v_row record;
  v_due integer;
  v_count integer := 0;
begin
  for v_row in
    select h.idempotency_key, h.amount, j.result -> 'credits' as credits
      from public.credit_holds h
      join public.panel_jobs j on j.id = h.panel_job_id
     where h.status = 'open'
       and j.queue = v_queue
       and j.status not in ('queued', 'running')
     order by h.created_at
  loop
    v_due := case when (v_row.credits ->> 'due') ~ '^[0-9]{1,9}$' then (v_row.credits ->> 'due')::integer end;
    if v_due is not null and v_due > 0 and v_due <= v_row.amount then
      perform public.settle_credits(
        v_row.idempotency_key,
        v_due,
        case when jsonb_typeof(v_row.credits -> 'units') = 'object' then v_row.credits -> 'units' end,
        v_row.credits ->> 'priceVersion'
      );
    else
      perform public.release_credits(v_row.idempotency_key);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.sweep_panel_job_credits(text) from public, anon, authenticated;
grant execute on function public.sweep_panel_job_credits(text) to service_role;
