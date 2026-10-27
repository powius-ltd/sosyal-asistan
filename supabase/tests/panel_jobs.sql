-- 0016_panel_jobs testi: panel iş kuyruğu. Şekil kısıtları, KISIT 1 (onaysız harcama yazılamaz), KISIT 2 (onay kaydı), tek etkin iş,
-- istek/claim/iptal RPC'leri (iki claim → tek kazanan, kuyruk yalıtımı, yetim iş), çit (işçi kimlikli yazım), koruma trigger'ı, yetki + RLS.
-- Fixture (_fixture.sql): A ve B'de BİTMİŞ birer iş (…b7). Kimlikler: A …a1 sahip, …a2 editör, …a3 izleyici; B …b1 sahip.
-- Testler kendi kuyruk adlarını kullanır (`test_q`, `other_q`); `panel` kuyruğundan claim YAPILMAZ (dosya tek transaction'da koşup geri
-- alınır: canlı işçi buradaki satırları hiç görmez).

insert into public.workspaces (id, name, slug, apify_monthly_cap_usd, llm_monthly_cap_usd)
values ('cccccccc-0000-4000-8000-000000000001', 'Test C', 'test-c', 10, 10);

-- ── Şekil kısıtları ────────────────────────────────────────────────────────────
select tap.eq($$select count(*)::text || ':' || min(status) from public.panel_jobs where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  '1:succeeded', 'fixture: A''da tek ve bitmiş iş var (etkin iş yok)');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind) values ('aaaaaaaa-0000-4000-8000-000000000001', 'deploy')$$,
  'tür beyaz listeden (7 tür)', 'panel_jobs_kind_check');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, status, finished_at) values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyze', 'paused', now())$$,
  'durum listeden', 'panel_jobs_status_check');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, queue) values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyze', 'Test Kuyruk')$$,
  'kuyruk adı küçük harf/rakam/tire biçiminde', 'panel_jobs_queue_check');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, params) values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyze', '[]')$$,
  'params nesne olmalı', 'panel_jobs_params_check');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, steps) values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyze', '{}')$$,
  'steps dizi olmalı', 'panel_jobs_steps_check');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, progress) values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyze', '[1, 2]')$$,
  'progress nesne olmalı', 'panel_jobs_progress_check');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, log_tail) values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyze', repeat('x', 8001))$$,
  'günlük kuyruğu sınırlı (8000 karakter)', 'panel_jobs_log_tail_check');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, dry_run) values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyze', true)$$,
  'önizlemesi olmayan türde kuru koşu yok', 'panel_jobs_dry_run_kind');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, worker_id) values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyze', 'w1')$$,
  'sıradaki işin işçisi olamaz', 'panel_jobs_queued_shape');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, status, worker_id, started_at) values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyze', 'running', 'w1', now())$$,
  'çalışan iş nabızsız olamaz', 'panel_jobs_running_shape');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, status) values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyze', 'failed')$$,
  'biten işin bitiş anı zorunlu', 'panel_jobs_finished_shape');
select tap.throws('23503', $$insert into public.panel_jobs (workspace_id, kind) values ('dddddddd-0000-4000-8000-000000000001', 'analyze')$$,
  'bilinmeyen çalışma alanına iş yazılamaz (FK)');

-- ── KISIT 1: onaysız harcama satırı yazılamaz ─────────────────────────────────
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind) values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect')$$,
  'KISIT 1: onaysız toplama işi yazılamaz', 'panel_jobs_spend_needs_approval');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind) values ('aaaaaaaa-0000-4000-8000-000000000001', 'measure')$$,
  'KISIT 1: onaysız ölçüm işi yazılamaz', 'panel_jobs_spend_needs_approval');
select tap.affects(1, $$insert into public.panel_jobs (workspace_id, kind, dry_run) values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', true)$$,
  'kuru koşu toplama onaysız yazılır ($0)');
delete from public.panel_jobs where status = 'queued';
select tap.affects(1, $$insert into public.panel_jobs (workspace_id, kind) values ('aaaaaaaa-0000-4000-8000-000000000001', 'routine')$$,
  'onaysız haftalık tur yazılır (toplama adımı onay bekler, diğer adımlar $0)');
delete from public.panel_jobs where status = 'queued';

-- ── KISIT 2: onay kaydı ───────────────────────────────────────────────────────
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_max_usd, approved_by, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyze', 'one_time', 0.2, 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$,
  'KISIT 2: harcamayan türde onay kaydı olmaz', 'panel_jobs_approval_scope');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, dry_run, approval_basis, approved_max_usd, approved_by, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', true, 'one_time', 0.2, 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$,
  'KISIT 2: kuru koşuda onay kaydı olmaz', 'panel_jobs_approval_scope');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_by, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', 'one_time', 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$,
  'KISIT 2: tek seferlik onay tutar ister', 'panel_jobs_one_time_amount');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_max_usd, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', 'one_time', 0.2, now())$$,
  'KISIT 2: onaylayan olmadan onay olmaz', 'panel_jobs_approval_record');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_max_usd, approved_by)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', 'one_time', 0.2, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'KISIT 2: onay anı olmadan onay olmaz', 'panel_jobs_approval_record');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, approved_max_usd) values ('aaaaaaaa-0000-4000-8000-000000000001', 'routine', 0.2)$$,
  'KISIT 2: dayanaksız tutar yazılamaz', 'panel_jobs_approval_record');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_max_usd, approved_by, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', 'one_time', 2.01, 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$,
  'onaylı tutar 2 USD üstü olamaz', 'panel_jobs_approved_max_usd_check');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_max_usd, approved_by, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', 'one_time', 0, 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$,
  'onaylı tutar 0 olamaz', 'panel_jobs_approved_max_usd_check');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_by, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', 'forever', 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$,
  'onay dayanağı listeden', 'panel_jobs_approval_basis_check');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_max_usd, approved_by, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', 'one_time', 0.2, 'aaaaaaaa-0000-4000-8000-0000000000a3', now())$$,
  'izleyici (viewer) harcama onaylayamaz', 'panel_job_approver_not_editor');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_max_usd, approved_by, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', 'one_time', 0.2, 'bbbbbbbb-0000-4000-8000-0000000000b1', now())$$,
  'başka çalışma alanının sahibi bu çalışma alanında harcama onaylayamaz', 'panel_job_approver_not_editor');

-- Geçerli onaylar: tek seferlik (editör) ve aylık tavan dayanağı (tutar isteğe bağlı).
select tap.affects(1, $$insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_max_usd, approved_by, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', 'one_time', 0.2, 'aaaaaaaa-0000-4000-8000-0000000000a2', now())$$,
  'tek seferlik onaylı toplama (editör onayı) yazılır');
select tap.affects(1, $$insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_by, approved_at)
  values ('bbbbbbbb-0000-4000-8000-000000000001', 'measure', 'monthly_cap', 'bbbbbbbb-0000-4000-8000-0000000000b1', now())$$,
  'aylık tavan dayanaklı ölçüm tutarsız yazılır (tavan çalışma alanında)');

-- ── KURAL 3: çalışma alanı başına tek etkin iş ────────────────────────────────
select tap.throws('23505', $$insert into public.panel_jobs (workspace_id, kind) values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyze')$$,
  'KURAL 3: çalışma alanında ikinci etkin iş yazılamaz', 'panel_jobs_one_active_per_workspace');
select tap.throws('23505', $$insert into public.panel_jobs (workspace_id, kind, queue) values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyze', 'other_q')$$,
  'tek etkin iş kuyruktan bağımsızdır (çalışma alanı başına)', 'panel_jobs_one_active_per_workspace');
select tap.affects(1, $$insert into public.panel_jobs (workspace_id, kind, queue) values ('cccccccc-0000-4000-8000-000000000001', 'routine', 'test_q')$$,
  'başka çalışma alanı aynı anda iş açabilir');

-- ── KURAL 4: kimlik ve onay sonradan değişmez ─────────────────────────────────
select tap.throws('23514', $$update public.panel_jobs set approved_max_usd = 2 where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and status = 'queued'$$,
  'onaylı tutar sonradan artırılamaz', 'panel_job_approval_immutable');
select tap.throws('23514', $$update public.panel_jobs set approval_basis = 'one_time', approved_max_usd = 0.5,
  approved_by = 'aaaaaaaa-0000-4000-8000-0000000000a1', approved_at = now() where workspace_id = 'cccccccc-0000-4000-8000-000000000001'$$,
  'onaysız iş sonradan onaylı yapılamaz', 'panel_job_approval_immutable');
select tap.throws('23514', $$update public.panel_jobs set kind = 'collect' where workspace_id = 'cccccccc-0000-4000-8000-000000000001'$$,
  'işin türü sonradan değişmez', 'panel_job_identity_immutable');
select tap.throws('23514', $$update public.panel_jobs set dry_run = true where workspace_id = 'cccccccc-0000-4000-8000-000000000001'$$,
  'kuru koşu bayrağı sonradan değişmez', 'panel_job_identity_immutable');
select tap.throws('23514', $$update public.panel_jobs set params = '{"limit": 999}' where workspace_id = 'cccccccc-0000-4000-8000-000000000001'$$,
  'parametreler sonradan değişmez', 'panel_job_identity_immutable');
select tap.throws('23514', $$update public.panel_jobs set queue = 'panel' where workspace_id = 'cccccccc-0000-4000-8000-000000000001'$$,
  'kuyruk sonradan değişmez', 'panel_job_identity_immutable');
select tap.throws('23514', $$update public.panel_jobs set status = 'succeeded', finished_at = now() where workspace_id = 'cccccccc-0000-4000-8000-000000000001'$$,
  'sıradaki iş çalışmadan başarılı olamaz', 'panel_job_invalid_transition');
delete from public.panel_jobs where status = 'queued';

-- ── request_panel_job ─────────────────────────────────────────────────────────
set local role service_role;
do $$
declare
  j public.panel_jobs;
begin
  j := public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'test_q', 'routine', false, '{}', null, null, 'aaaaaaaa-0000-4000-8000-0000000000a1');
  perform tap.ok(j.status = 'queued' and j.queue = 'test_q' and j.kind = 'routine' and not j.dry_run and j.params = '{}'::jsonb and j.steps = '[]'::jsonb
    and j.approval_basis is null and j.approved_max_usd is null and j.approved_by is null and j.approved_at is null
    and j.requested_by = 'aaaaaaaa-0000-4000-8000-0000000000a1' and j.worker_id is null and j.started_at is null and j.finished_at is null
    and j.workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001',
    'request_panel_job: sıradaki iş döner (onaysız tur: onay alanları boş)');
end $$;
select tap.throws('23505', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'test_q', 'analyze', false, '{}', null, null, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'etkin iş varken ikinci istek reddedilir (already_exists)', 'panel_job_active');
select tap.throws('23505', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'other_q', 'analyze', false, '{}', null, null, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'başka kuyruk adı da etkin işi aşamaz', 'panel_job_active');
select tap.eq($$select count(*)::text from public.panel_jobs where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '2',
  'reddedilen istek satır bırakmaz');
select tap.throws('23514', $$select public.request_panel_job('bbbbbbbb-0000-4000-8000-000000000001', 'test_q', 'collect', false, '{}', null, null, 'bbbbbbbb-0000-4000-8000-0000000000b1')$$,
  'RPC: onaysız toplama yazılamaz (KISIT 1)', 'panel_jobs_spend_needs_approval');
select tap.throws('23514', $$select public.request_panel_job('bbbbbbbb-0000-4000-8000-000000000001', 'test_q', 'analyze', false, '{}', 'one_time', 0.2, 'bbbbbbbb-0000-4000-8000-0000000000b1')$$,
  'RPC: harcamayan türe onay yazılamaz (KISIT 2)', 'panel_jobs_approval_scope');
select tap.throws('23514', $$select public.request_panel_job('bbbbbbbb-0000-4000-8000-000000000001', 'test_q', 'collect', false, '{}', 'one_time', 0.2, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'RPC: çalışma alanının üyesi olmayan kullanıcı harcama onaylayamaz', 'panel_job_approver_not_editor');
select tap.throws('23514', $$select public.request_panel_job('bbbbbbbb-0000-4000-8000-000000000001', 'test_q', 'collect', false, '{}', 'one_time', 0.2, null)$$,
  'RPC: kullanıcısız onay yazılamaz', 'panel_jobs_approval_record');
do $$
declare
  j public.panel_jobs;
begin
  j := public.request_panel_job('bbbbbbbb-0000-4000-8000-000000000001', 'test_q', 'collect', false, '{"limit": 10}', 'one_time', 0.25, 'bbbbbbbb-0000-4000-8000-0000000000b1');
  perform tap.ok(j.status = 'queued' and j.approval_basis = 'one_time' and j.approved_max_usd = 0.25
    and j.approved_by = 'bbbbbbbb-0000-4000-8000-0000000000b1' and j.approved_at is not null and j.params ->> 'limit' = '10',
    'request_panel_job: onaylı toplama → onaylayan = isteyen kullanıcı, an ve tutar yazılır');
  j := public.request_panel_job('cccccccc-0000-4000-8000-000000000001', '  ', 'collect', true, null, null, null, null);
  perform tap.ok(j.queue = 'panel' and j.dry_run and j.params = '{}'::jsonb and j.requested_by is null,
    'request_panel_job: boş kuyruk adı → panel, NULL parametre → {}');
end $$;
select tap.throws('P0002', $$select public.request_panel_job('dddddddd-0000-4000-8000-000000000001', 'test_q', 'analyze', false, '{}', null, null, null)$$,
  'bilinmeyen çalışma alanı reddedilir', 'workspace_not_found');
select tap.throws('22023', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'test_q', null, false, '{}', null, null, null)$$,
  'tür zorunlu', 'invalid_argument');
reset role;
delete from public.panel_jobs where status = 'queued';

-- ── claim_panel_job: sıra, tek kazanan, kuyruk yalıtımı ───────────────────────
-- A (10 dk önce) ve B (5 dk önce) `test_q` kuyruğunda; C (20 dk önce, en eski) `other_q` kuyruğunda.
insert into public.panel_jobs (id, workspace_id, queue, kind, created_at) values
  ('aaaaaaaa-0000-4000-8000-000000000a71', 'aaaaaaaa-0000-4000-8000-000000000001', 'test_q', 'routine', now() - interval '10 minutes'),
  ('bbbbbbbb-0000-4000-8000-000000000b71', 'bbbbbbbb-0000-4000-8000-000000000001', 'test_q', 'analyze', now() - interval '5 minutes'),
  ('cccccccc-0000-4000-8000-000000000c71', 'cccccccc-0000-4000-8000-000000000001', 'other_q', 'analyze', now() - interval '20 minutes');

set local role service_role;
select tap.throws('22023', $$select public.claim_panel_job('test_q', '   ')$$, 'işçi kimliği zorunlu', 'invalid_argument');
select tap.eq($$select count(*)::text from public.claim_panel_job('test_q', 'w1')$$, '1', 'claim: w1 bir iş alır');
select tap.eq($$select id::text || ':' || worker_id || ':' || (started_at is not null and heartbeat_at is not null)::text
  from public.panel_jobs where queue = 'test_q' and status = 'running'$$,
  'aaaaaaaa-0000-4000-8000-000000000a71:w1:true', 'kuyruğun en eski işi alındı; işçi, başlangıç ve nabız yazıldı');
select tap.eq($$select count(*)::text from public.claim_panel_job('test_q', 'w2')$$, '0',
  'İKİ CLAIM → TEK KAZANAN: taze nabızlı çalışan iş varken ikinci işçi iş alamaz (sırada iş beklese de)');
select tap.eq($$select status from public.panel_jobs where id = 'bbbbbbbb-0000-4000-8000-000000000b71'$$, 'queued', 'ikinci iş sırada bekler');
select tap.eq($$select status from public.panel_jobs where id = 'cccccccc-0000-4000-8000-000000000c71'$$, 'queued',
  'KUYRUK YALITIMI: başka kuyruğun işi (daha eski olsa da) alınmaz');

-- ── Çit: işçi kimlikli yazım ──────────────────────────────────────────────────
select tap.affects(0, $$update public.panel_jobs set heartbeat_at = now(), current_step = 'analyze'
  where id = 'aaaaaaaa-0000-4000-8000-000000000a71' and worker_id = 'w2' and status = 'running'$$,
  'ÇİT: işi almayan işçinin yazımı 0 satır etkiler');
select tap.affects(1, $$update public.panel_jobs set heartbeat_at = now(), current_step = 'analyze', progress = '{"done": 1, "total": 5}',
  steps = '[{"id": "analyze", "status": "running"}]', log_tail = '[1/5] video'
  where id = 'aaaaaaaa-0000-4000-8000-000000000a71' and worker_id = 'w1' and status = 'running'$$,
  'işi alan işçi çitli yazımla adım, sayaç ve günlük yazar');
select tap.throws('23514', $$update public.panel_jobs set worker_id = 'w2' where id = 'aaaaaaaa-0000-4000-8000-000000000a71'$$,
  'işi alan işçi sonradan değiştirilemez', 'panel_job_claim_immutable');
select tap.throws('23514', $$update public.panel_jobs set status = 'queued', worker_id = null, started_at = null, heartbeat_at = null
  where id = 'aaaaaaaa-0000-4000-8000-000000000a71'$$,
  'çalışan iş sıraya geri alınamaz', 'panel_job_invalid_transition');
select tap.throws('23514', $$update public.panel_jobs set status = 'succeeded' where id = 'aaaaaaaa-0000-4000-8000-000000000a71'$$,
  'bitiş anı olmadan iş bitirilemez', 'panel_jobs_finished_shape');

-- ── Yetim iş: nabız 90 sn'den eskiyse claim kapatır ───────────────────────────
update public.panel_jobs set heartbeat_at = now() - interval '60 seconds' where id = 'aaaaaaaa-0000-4000-8000-000000000a71';
select tap.eq($$select count(*)::text from public.claim_panel_job('test_q', 'w2')$$, '0', '60 sn''lik nabız taze sayılır: iş kapatılmaz, w2 iş alamaz');
update public.panel_jobs set heartbeat_at = now() - interval '5 minutes' where id = 'aaaaaaaa-0000-4000-8000-000000000a71';
select tap.eq($$select count(*)::text from public.claim_panel_job('test_q', 'w2')$$, '1', 'YETİM: nabzı kesilen iş kapatılır, sıradaki işi w2 alır');
select tap.eq($$select status || ':' || (result ->> 'outcome') || ':' || (finished_at is not null)::text || ':' || (error like 'worker_lost:%')::text
  from public.panel_jobs where id = 'aaaaaaaa-0000-4000-8000-000000000a71'$$,
  'failed:worker_lost:true:true', 'yetim iş failed + sonuç kodu worker_lost ile kapanır');
select tap.eq($$select status || ':' || worker_id from public.panel_jobs where id = 'bbbbbbbb-0000-4000-8000-000000000b71'$$, 'running:w2', 'sıradaki iş w2''de çalışıyor');
select tap.affects(0, $$update public.panel_jobs set heartbeat_at = now()
  where id = 'aaaaaaaa-0000-4000-8000-000000000a71' and worker_id = 'w1' and status = 'running'$$,
  'ÇİT: işi kapatılan işçinin nabzı 0 satır etkiler (işçi durur)');
select tap.throws('23514', $$update public.panel_jobs set status = 'succeeded' where id = 'aaaaaaaa-0000-4000-8000-000000000a71'$$,
  'bitmiş iş donar: çitsiz yazım bile durumu değiştiremez', 'panel_job_finished');
select tap.throws('23514', $$update public.panel_jobs set steps = '[]' where id = 'aaaaaaaa-0000-4000-8000-000000000a71'$$,
  'bitmiş işin adımları değiştirilemez', 'panel_job_finished');
select tap.throws('23514', $$update public.panel_jobs set log_tail = 'yeni satır' where id = 'aaaaaaaa-0000-4000-8000-000000000a71'$$,
  'bitmiş işe günlük yazılamaz', 'panel_job_finished');
select tap.affects(1, $$update public.panel_jobs set log_tail = null where id = 'aaaaaaaa-0000-4000-8000-000000000a71'$$,
  'bitmiş işin günlüğü temizlenebilir (yalnız NULL)');

-- İşçi işi bitirir; kuyruk boşalınca claim boş döner.
select tap.affects(1, $$update public.panel_jobs set status = 'partial', finished_at = now(), result = '{"outcome": "step_failed", "exitCode": 4}'
  where id = 'bbbbbbbb-0000-4000-8000-000000000b71' and worker_id = 'w2' and status = 'running'$$,
  'işçi işi çitli yazımla bitirir (kısmi)');
select tap.eq($$select count(*)::text from public.claim_panel_job('test_q', 'w3')$$, '0', 'boş kuyrukta claim boş döner');

-- ── İstek anında yetim kapatma ────────────────────────────────────────────────
select tap.eq($$select count(*)::text from public.claim_panel_job('other_q', 'wx')$$, '1', 'other_q: wx işi aldı');
select tap.throws('23505', $$select public.request_panel_job('cccccccc-0000-4000-8000-000000000001', 'other_q', 'analyze', false, '{}', null, null, null)$$,
  'çalışan (taze nabızlı) iş varken yeni istek reddedilir', 'panel_job_active');
update public.panel_jobs set heartbeat_at = now() - interval '5 minutes' where id = 'cccccccc-0000-4000-8000-000000000c71';
select tap.affects(1, $$select public.request_panel_job('cccccccc-0000-4000-8000-000000000001', 'other_q', 'analyze', false, '{}', null, null, null)$$,
  'YETİM: yeni istek yanıt vermeyen işi kapatır ve yeni işi sıraya yazar');
select tap.eq($$select status || ':' || (result ->> 'outcome') from public.panel_jobs where id = 'cccccccc-0000-4000-8000-000000000c71'$$,
  'failed:worker_lost', 'istek anında kapatılan iş failed + worker_lost');

-- ── cancel_panel_job ──────────────────────────────────────────────────────────
do $$
declare
  v_id uuid;
  j public.panel_jobs;
begin
  select id into v_id from public.panel_jobs where workspace_id = 'cccccccc-0000-4000-8000-000000000001' and status = 'queued';
  perform tap.throws('P0002', format('select public.cancel_panel_job(%L, %L)', 'aaaaaaaa-0000-4000-8000-000000000001', v_id),
    'başka çalışma alanının işi iptal edilemez (bulunamadı)', 'panel_job_not_found');
  j := public.cancel_panel_job('cccccccc-0000-4000-8000-000000000001', v_id);
  perform tap.ok(j.status = 'cancelled' and j.finished_at is not null and j.cancel_requested_at is not null and j.started_at is null,
    'iptal: sıradaki iş anında cancelled');
  perform tap.throws('23514', format('select public.cancel_panel_job(%L, %L)', 'cccccccc-0000-4000-8000-000000000001', v_id),
    'bitmiş iş iptal edilemez (invalid_state)', 'panel_job_finished');

  -- Çalışan (taze) iş: iptal isteği yazılır, iş çalışmaya devam eder; işçi adım sınırında kendisi durur.
  j := public.request_panel_job('cccccccc-0000-4000-8000-000000000001', 'other_q', 'analyze', false, '{}', null, null, null);
  v_id := j.id;
  perform public.claim_panel_job('other_q', 'wy');
  j := public.cancel_panel_job('cccccccc-0000-4000-8000-000000000001', v_id);
  perform tap.ok(j.status = 'running' and j.cancel_requested_at is not null and j.finished_at is null,
    'iptal: çalışan işte yalnız iptal isteği yazılır (iş adım sınırına kadar sürer)');
  j := public.cancel_panel_job('cccccccc-0000-4000-8000-000000000001', v_id);
  perform tap.ok(j.status = 'running' and j.cancel_requested_at is not null, 'iptal: tekrar çağrı hata vermez (idempotent)');
  perform tap.throws('23514', format('update public.panel_jobs set cancel_requested_at = null where id = %L', v_id),
    'iptal isteği geri alınamaz', 'panel_job_cancel_immutable');
  perform tap.affects(1, format($f$update public.panel_jobs set status = 'cancelled', finished_at = now() where id = %L and worker_id = 'wy' and status = 'running'$f$, v_id),
    'işçi iptal isteğini görünce işi cancelled olarak kapatır');

  -- Yanıt vermeyen (yetim) çalışan iş: iptal onu worker_lost olarak kapatır.
  j := public.request_panel_job('cccccccc-0000-4000-8000-000000000001', 'other_q', 'analyze', false, '{}', null, null, null);
  v_id := j.id;
  perform public.claim_panel_job('other_q', 'wz');
  update public.panel_jobs set heartbeat_at = now() - interval '5 minutes' where id = v_id;
  j := public.cancel_panel_job('cccccccc-0000-4000-8000-000000000001', v_id);
  perform tap.ok(j.status = 'failed' and j.result ->> 'outcome' = 'worker_lost' and j.finished_at is not null,
    'iptal: yanıt vermeyen çalışan iş failed + worker_lost olarak kapanır');
end $$;
select tap.throws('P0002', $$select public.cancel_panel_job('cccccccc-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-0000000000d1')$$,
  'bilinmeyen iş iptal edilemez', 'panel_job_not_found');
select tap.throws('22023', $$select public.cancel_panel_job('cccccccc-0000-4000-8000-000000000001', null)$$, 'iş kimliği zorunlu', 'invalid_argument');
reset role;

-- Silme davranışı: çalışma alanı silinince işleri de gider (cascade).
delete from public.workspaces where id = 'cccccccc-0000-4000-8000-000000000001';
select tap.eq($$select count(*)::text from public.panel_jobs where workspace_id = 'cccccccc-0000-4000-8000-000000000001'$$, '0', 'çalışma alanı silinince işleri silinir');

-- ── Yetki matrisi ─────────────────────────────────────────────────────────────
select tap.ok(has_function_privilege('service_role', 'public.request_panel_job(uuid, text, text, boolean, jsonb, text, numeric, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.request_panel_job(uuid, text, text, boolean, jsonb, text, numeric, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.request_panel_job(uuid, text, text, boolean, jsonb, text, numeric, uuid)', 'execute'),
  'request_panel_job: yalnız service role EXECUTE');
select tap.ok(has_function_privilege('service_role', 'public.claim_panel_job(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_panel_job(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.claim_panel_job(text, text)', 'execute'),
  'claim_panel_job: yalnız service role EXECUTE');
select tap.ok(has_function_privilege('service_role', 'public.cancel_panel_job(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.cancel_panel_job(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.cancel_panel_job(uuid, uuid)', 'execute'),
  'cancel_panel_job: yalnız service role EXECUTE');
select tap.ok(not has_function_privilege('authenticated', 'private.close_stale_panel_jobs(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'private.close_stale_panel_jobs(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'private.panel_jobs_guard()', 'execute'),
  'yardımcı fonksiyonlar istemci rollerine kapalı');
select tap.ok(has_table_privilege('service_role', 'public.panel_jobs', 'insert') and has_table_privilege('service_role', 'public.panel_jobs', 'update')
  and not has_table_privilege('authenticated', 'public.panel_jobs', 'select')
  and not has_any_column_privilege('authenticated', 'public.panel_jobs', 'INSERT, UPDATE')
  and not has_table_privilege('authenticated', 'public.panel_jobs', 'delete')
  and not has_any_column_privilege('anon', 'public.panel_jobs', 'SELECT'),
  'yetki matrisi: service role yazar; authenticated tablo düzeyinde okuyamaz/yazamaz; anon hiçbir şey');
do $$
declare
  c text;
begin
  foreach c in array array['id', 'workspace_id', 'queue', 'kind', 'dry_run', 'status', 'current_step', 'progress', 'heartbeat_at',
    'cancel_requested_at', 'created_at', 'started_at', 'finished_at'] loop
    if not has_column_privilege('authenticated', 'public.panel_jobs', c, 'SELECT') then
      raise exception 'FAIL: authenticated durum sütununu okuyamıyor: %', c;
    end if;
  end loop;
  foreach c in array array['params', 'approval_basis', 'approved_max_usd', 'approved_by', 'approved_at', 'steps', 'log_tail', 'result', 'error',
    'worker_id', 'requested_by'] loop
    if has_column_privilege('authenticated', 'public.panel_jobs', c, 'SELECT') then
      raise exception 'FAIL: authenticated yönetici sütununu okuyabiliyor: %', c;
    end if;
  end loop;
  raise notice 'ok - üye yalnız 13 durum sütununu okur; adım notu, günlük, hata, sonuç, parametre ve onay/tutar sütunları kapalı';
end $$;

-- ── RLS yalıtımı ──────────────────────────────────────────────────────────────
select set_config('test.a_jobs', (select count(*)::text from public.panel_jobs where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'), true);
select tap.ok(current_setting('test.a_jobs')::int >= 2, 'A''da en az 2 iş var (yalıtım testi boş değil)');
select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a3'), true);
set local role authenticated;
select tap.eq($$select count(*)::text from public.panel_jobs$$, current_setting('test.a_jobs'), 'viewer yalnız kendi çalışma alanının işlerini okur');
select tap.eq($$select count(*)::text from public.panel_jobs where workspace_id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, '0', 'A üyesi B''nin işlerini görmez');
select tap.eq($$select status from public.panel_jobs where id = 'aaaaaaaa-0000-4000-8000-0000000000b7'$$, 'succeeded', 'üye iş durumunu okur');
select tap.throws('42501', $$select log_tail from public.panel_jobs$$, 'üye günlüğü okuyamaz (sütun yetkisi)');
select tap.throws('42501', $$select approved_max_usd from public.panel_jobs$$, 'üye onaylı tutarı okuyamaz (sütun yetkisi)');
select tap.throws('42501', $$select steps from public.panel_jobs$$, 'üye adım notlarını okuyamaz (sütun yetkisi)');
select tap.throws('42501', $$select * from public.panel_jobs$$, 'üye tüm sütunları (select *) okuyamaz');
select tap.throws('42501', $$insert into public.panel_jobs (workspace_id, kind) values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyze')$$, 'authenticated iş yazamaz (yalnız sunucu)');
select tap.throws('42501', $$update public.panel_jobs set status = 'cancelled'$$, 'authenticated işi değiştiremez');
select tap.throws('42501', $$delete from public.panel_jobs$$, 'authenticated işi silemez');
select tap.throws('42501', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'test_q', 'analyze', false, '{}', null, null, null)$$,
  'authenticated iş isteyemez (RPC yalnız sunucu)');
select tap.throws('42501', $$select * from public.claim_panel_job('test_q', 'w9')$$, 'authenticated iş alamaz (RPC yalnız sunucu)');
select tap.throws('42501', $$select public.cancel_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b7')$$,
  'authenticated iş iptal edemez (RPC yalnız sunucu)');
reset role;

select set_config('request.jwt.claims', tap.claims('bbbbbbbb-0000-4000-8000-0000000000b1'), true);
set local role authenticated;
select tap.eq($$select count(*)::text from public.panel_jobs where workspace_id <> 'bbbbbbbb-0000-4000-8000-000000000001'$$, '0', 'B üyesi başka çalışma alanının işini görmez');
select tap.ok((select count(*) from public.panel_jobs) >= 1, 'B üyesi kendi işlerini okur');
reset role;

set local role anon;
select tap.throws('42501', $$select count(*) from public.panel_jobs$$, 'anon işleri okuyamaz (permission denied)');
reset role;
