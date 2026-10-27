-- 0021_onboarding testi: başlangıç işi (`onboarding`: probe / build). Şekil kısıtları (sabit tavan, dayanak ↔ tür kilidi, önizleme yok),
-- "bakış bitmeden ilk tur yok", hesap başına tek ilk tur (kısmi benzersiz indeks), deneme sınırı (probe 3, build 2), hesap onayı sütunu ve
-- create_workspace'te kullanıcı başına tekil hesap.
-- Kimlikler (_fixture.sql): A sahibi …a1, A çalışma alanı aaaaaaaa-…-0001 (kendi hesap `test_a_own`); B sahibi …b1, B çalışma alanı bbbbbbbb-…-0001.
-- Testler kendi kuyruğunu kullanır (`onb_q`); dosya tek transaction'da koşup geri alınır: canlı kuyruğa ve gerçek hesaplara dokunmaz.

select tap.eq($$select coalesce(account_confirmed_at::text, 'NULL') from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'NULL', 'hesap onayı varsayılan NULL (onaylanmadı)');

-- Yardımcı: kuyruğun sıradaki işini alır ve verilen durumla bitirir (işçinin yolu: claim + çitli yazım).
create function tap.finish_next(p_status text) returns void
language plpgsql as $$
declare
  v_id uuid;
begin
  select j.id into v_id from public.claim_panel_job('onb_q', 'onb-worker') j;
  if v_id is null then
    raise exception 'FAIL: alınacak iş yok';
  end if;
  update public.panel_jobs set status = p_status, finished_at = now() where id = v_id and worker_id = 'onb-worker' and status = 'running';
end;
$$;

set local role service_role;

-- ── Şekil kısıtları ────────────────────────────────────────────────────────────
select tap.throws('23514', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"probe"}', null, null, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'onaysız başlangıç işi yazılamaz');
select tap.throws('23514', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"probe"}', 'one_time', 0.20, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'başlangıç işi yalnız kendi dayanağıyla yazılır', 'panel_jobs_onboarding_basis');
select tap.throws('23514', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'collect', false, '{}', 'onboarding', 0.20, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'başlangıç dayanağı başka türde kullanılamaz', 'panel_jobs_onboarding_basis');
select tap.throws('23514', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"probe"}', 'onboarding', 0.40, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'bakışın tutarı sabit tavandır (0,20): başka tutar yazılamaz', 'panel_jobs_onboarding_shape');
select tap.throws('23514', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"probe"}', 'onboarding', 2, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'tavan girdiyle büyütülemez', 'panel_jobs_onboarding_shape');
select tap.throws('23514', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{}', 'onboarding', 0.20, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'aşama zorunlu', 'panel_jobs_onboarding_shape');
select tap.throws('23514', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"resume"}', 'onboarding', 0.40, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'aşama listeden (probe / build)', 'panel_jobs_onboarding_shape');
select tap.throws('23514', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', true, '{"phase":"probe"}', null, null, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'başlangıç işinde önizleme yok');
select tap.eq($$select count(*)::text from public.panel_jobs where kind = 'onboarding'$$, '0', 'reddedilen istekler satır yazmadı');

-- ── Bakış bitmeden ilk tur yok ─────────────────────────────────────────────────
select tap.throws('23514', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"build"}', 'onboarding', 0.40, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'bakış bitmeden ilk tur yazılamaz', 'panel_job_onboarding_needs_probe');

-- ── Bakış: sabit tavanlı onay satıra yazılır ───────────────────────────────────
select tap.eq($$select status || ':' || approval_basis || ':' || approved_max_usd::numeric(4,2)::text || ':' || (approved_by is not null)::text
                from public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"probe"}', 'onboarding', 0.20, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'queued:onboarding:0.20:true', 'bakış işi: sırada, dayanak onboarding, tutar 0,20, onaylayan yazılı');
-- RPC yolunda etkin iş denetimi (0020 `request_panel_job_credited`) satır yazmadan ÖNCE düşer: hata `panel_job_active`.
select tap.throws('23505', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"build"}', 'onboarding', 0.40, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'bakış SÜRERKEN ilk tur açılamaz (etkin iş)', 'panel_job_active');
-- Trigger da tek başına tutar: sırada / çalışan bakış "bitmiş" sayılmaz (RPC'yi atlayan doğrudan yazım).
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, queue, kind, dry_run, params, approval_basis, approved_max_usd, approved_by, approved_at, requested_by)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"build"}', 'onboarding', 0.40, 'aaaaaaaa-0000-4000-8000-0000000000a1', now(), 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'bakış SÜRERKEN de ilk tur yazılamaz (trigger)', 'panel_job_onboarding_needs_probe');
select tap.finish_next('succeeded');

-- ── İlk tur: sabit tavan, tek etkin iş, deneme sınırı ──────────────────────────
select tap.throws('23514', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"build"}', 'onboarding', 0.20, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'ilk turun tutarı sabit tavandır (0,40)', 'panel_jobs_onboarding_shape');
select tap.eq($$select status || ':' || approved_max_usd::numeric(4,2)::text || ':' || (params ->> 'phase')
                from public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"build","rivalIds":["aaaaaaaa-0000-4000-8000-0000000000c2"]}', 'onboarding', 0.40, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'queued:0.40:build', 'ilk tur işi: sırada, tutar 0,40');
select tap.throws('23505', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"build"}', 'onboarding', 0.40, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'ilk tur sürerken ikincisi açılamaz', 'panel_job_active');
select tap.throws('23514', $$update public.panel_jobs set approved_max_usd = 2 where kind = 'onboarding' and status = 'queued'$$,
  'onay tutarı sonradan değiştirilemez', 'panel_job_approval_immutable');
select tap.finish_next('failed');
select tap.eq($$select status from public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"build"}', 'onboarding', 0.40, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'queued', 'hata ile biten ilk tur yeniden denenebilir (2. deneme)');
select tap.finish_next('failed');
select tap.throws('23514', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"build"}', 'onboarding', 0.40, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'ilk tur en çok 2 kez denenir', 'panel_job_onboarding_limit');

-- Bakış en çok 3 kez (iptal edilenler de sayılır).
select public.cancel_panel_job('aaaaaaaa-0000-4000-8000-000000000001', (select id from public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"probe"}', 'onboarding', 0.20, 'aaaaaaaa-0000-4000-8000-0000000000a1')));
select public.cancel_panel_job('aaaaaaaa-0000-4000-8000-000000000001', (select id from public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"probe"}', 'onboarding', 0.20, 'aaaaaaaa-0000-4000-8000-0000000000a1')));
select tap.throws('23514', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"probe"}', 'onboarding', 0.20, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'bakış en çok 3 kez denenir (iptal dahil)', 'panel_job_onboarding_limit');
select tap.eq($$select count(*) filter (where params ->> 'phase' = 'probe')::text || ':' || count(*) filter (where params ->> 'phase' = 'build')::text
                from public.panel_jobs where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and kind = 'onboarding'$$,
  '3:2', 'A: 3 bakış + 2 ilk tur satırı');

-- ── Hesap başına TEK ilk tur (B çalışma alanı) ─────────────────────────────────
select tap.eq($$select status from public.request_panel_job('bbbbbbbb-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"probe"}', 'onboarding', 0.20, 'bbbbbbbb-0000-4000-8000-0000000000b1')$$,
  'queued', 'B: bakış');
select tap.finish_next('partial');
select tap.eq($$select status from public.request_panel_job('bbbbbbbb-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"build"}', 'onboarding', 0.40, 'bbbbbbbb-0000-4000-8000-0000000000b1')$$,
  'queued', 'B: kısmi biten bakıştan sonra ilk tur açılır');
select tap.finish_next('succeeded');
select tap.throws('23505', $$select public.request_panel_job('bbbbbbbb-0000-4000-8000-000000000001', 'onb_q', 'onboarding', false, '{"phase":"build"}', 'onboarding', 0.40, 'bbbbbbbb-0000-4000-8000-0000000000b1')$$,
  'biten ilk tur yeniden açılamaz (hesap başına bir kez)', 'panel_jobs_one_onboarding_build');
-- Başlangıç işi olmayan işler etkilenmez (onaysız haftalık tur: kalan iş bununla sürer).
select tap.eq($$select status || ':' || coalesce(approval_basis, 'NULL') from public.request_panel_job('bbbbbbbb-0000-4000-8000-000000000001', 'onb_q', 'routine', false, '{}', null, null, 'bbbbbbbb-0000-4000-8000-0000000000b1')$$,
  'queued:NULL', 'ilk turdan sonra onaysız haftalık tur açılır');

-- ── create_workspace: kullanıcı başına tekil hesap ─────────────────────────────
select tap.throws('23505', $$select * from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Kopya', 'kopya', '', '', '', '', 'instagram', 'test_a_own', '', '')$$,
  'sahibi olunan çalışma alanındaki hesap ikinci kez açılamaz', 'own_account_exists');
select tap.eq($$select name from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Tekil', 'tekil', '', '', '', '', 'instagram', 'tekil.hesap', '', '')$$,
  'Tekil', 'yeni hesap açılır');
select tap.throws('23505', $$select * from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Tekil İki', 'tekil-iki', '', '', '', '', 'instagram', 'tekil.hesap', '', '')$$,
  'aynı kullanıcı + aynı platform + aynı kullanıcı adı ikinci kez açılamaz', 'own_account_exists');
select tap.throws('23505', $$select * from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Tekil Eski', 'tekil-eski', '', '', '', '', 'instagram', 'tekil.hesap')$$,
  'eski 9 parametreli imza da aynı kurala uyar', 'own_account_exists');
select tap.eq($$select name from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Tekil TikTok', 'tekil-tiktok', '', '', '', '', 'tiktok', 'tekil.hesap', '', '')$$,
  'Tekil TikTok', 'aynı kullanıcı adı BAŞKA platformda açılır');
select tap.eq($$select name from public.create_workspace('bbbbbbbb-0000-4000-8000-0000000000b1', 'Tekil B', 'tekil-b', '', '', '', '', 'instagram', 'tekil.hesap', '', '')$$,
  'Tekil B', 'aynı hesap BAŞKA kullanıcıda açılır');
select tap.eq($$select count(*)::text from public.workspaces where slug in ('kopya', 'tekil-iki', 'tekil-eski')$$, '0', 'reddedilen açılış çalışma alanı bırakmaz');
