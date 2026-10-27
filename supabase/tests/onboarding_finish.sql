-- 0022_onboarding_finish testi: `onboarding` bildirim türü (iş başına tek bildirim) ve onaylanmamış çalışma alanını kaldırma
-- (`discard_unconfirmed_workspace`: yalnız güvenli durumda siler, gerçek veri taşıyanı asla).
-- Kimlikler (_fixture.sql): A sahibi …a1, A çalışma alanı aaaaaaaa-…-0001; B sahibi …b1. Dosya tek transaction'da koşup geri alınır.
-- Testler kendi kuyruğunu kullanır (`onb_fin_q`): canlı kuyruğa dokunmaz.

set local role service_role;

-- ── Bildirim türü ve tekrarsızlık ──────────────────────────────────────────────
select tap.affects(1, $$insert into public.notifications (workspace_id, kind, title, body, dedupe_key)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'onboarding', 'İlk planın hazır', 'x', 'onboarding:11111111-1111-4111-8111-111111111111')$$,
  'onboarding türünde bildirim yazılır');
select tap.throws('23505', $$insert into public.notifications (workspace_id, kind, title, body, dedupe_key)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'onboarding', 'İlk planın hazır', 'x', 'onboarding:11111111-1111-4111-8111-111111111111')$$,
  'aynı iş için ikinci bildirim yazılamaz', 'notifications_dedupe_key');
select tap.throws('23514', $$insert into public.notifications (workspace_id, kind, title) values ('aaaaaaaa-0000-4000-8000-000000000001', 'bilinmeyen', 'x')$$,
  'bilinmeyen tür hâlâ reddedilir', 'notifications_kind_check');

-- ── Yetki: yalnız service role çağırabilir ─────────────────────────────────────
select tap.ok(has_function_privilege('service_role', 'public.discard_unconfirmed_workspace(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.discard_unconfirmed_workspace(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.discard_unconfirmed_workspace(uuid, uuid)', 'execute'),
  'discard_unconfirmed_workspace yalnız service role a açık');

-- Yardımcı: çalışma alanının bütün panel işlerini verilen durumla bitirir (işçinin elinden geçmiş gibi).
-- `tap` şemasında yalnız usage herkese açık: fonksiyonu sahibi (postgres) yaratır, sonra service role'e dönülür.
-- İki adım (0016 geçiş kuralı: queued → yalnız running / cancelled / failed): önce işçi alır, sonra bitirir.
reset role;
create function tap.settle_jobs(p_ws uuid, p_status text) returns void
language plpgsql as $$
begin
  update public.panel_jobs set status = 'running', started_at = now(), worker_id = 'w1', heartbeat_at = now()
   where workspace_id = p_ws and status = 'queued';
  update public.panel_jobs set status = p_status, finished_at = now()
   where workspace_id = p_ws and status = 'running';
end;
$$;
set local role service_role;

-- ── Kaldırma: güvenli durum ────────────────────────────────────────────────────
create temp table _w on commit drop as
  select * from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Yanlış Hesap', 'yanlis-hesap', '', '', '', '', 'instagram', 'yanlis.hesap', '', '');
grant select on _w to service_role;
select tap.eq($$select status from public.request_panel_job((select id from _w), 'onb_fin_q', 'onboarding', false, '{"phase":"probe"}', 'onboarding', 0.20, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'queued', 'bakış işi açıldı');
select tap.throws('23514', $$select public.discard_unconfirmed_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', (select id from _w))$$,
  'bakış SÜRERKEN kaldırılamaz (etkin iş)', 'workspace_not_discardable');
select tap.settle_jobs((select id from _w), 'succeeded');
insert into public.competitors (workspace_id, platform, handle, status, source) values ((select id from _w), 'instagram', 'aday_hesap', 'candidate', 'related');
select tap.throws('P0002', $$select public.discard_unconfirmed_workspace('bbbbbbbb-0000-4000-8000-0000000000b1', (select id from _w))$$,
  'sahibi olmayan kullanıcı kaldıramaz', 'workspace_not_found');
select public.discard_unconfirmed_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', (select id from _w));
select tap.eq($$select count(*)::text from public.workspaces where slug = 'yanlis-hesap'$$, '0', 'bakışı bitmiş, onaysız çalışma alanı kaldırıldı');
select tap.eq($$select count(*)::text from public.competitors where handle = 'aday_hesap'$$, '0', 'bağlı kayıtlar zincirleme gitti');

-- ── Kaldırma: gerçek veri taşıyan çalışma alanları ASLA ────────────────────────
create temp table _c on commit drop as
  select * from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Onaylı', 'onayli', '', '', '', '', 'instagram', 'onayli.hesap', '', '');
grant select on _c to service_role;
update public.workspaces set account_confirmed_at = now() where id = (select id from _c);
select tap.throws('23514', $$select public.discard_unconfirmed_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', (select id from _c))$$,
  'onaylanmış hesap kaldırılamaz', 'workspace_not_discardable');

create temp table _d on commit drop as
  select * from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'İlk Tur Koştu', 'ilk-tur-kostu', '', '', '', '', 'instagram', 'ilk.tur', '', '');
grant select on _d to service_role;
select tap.eq($$select status from public.request_panel_job((select id from _d), 'onb_fin_q', 'onboarding', false, '{"phase":"probe"}', 'onboarding', 0.20, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$, 'queued', 'D: bakış');
select tap.settle_jobs((select id from _d), 'succeeded');
select tap.eq($$select status from public.request_panel_job((select id from _d), 'onb_fin_q', 'onboarding', false, '{"phase":"build"}', 'onboarding', 0.40, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$, 'queued', 'D: ilk tur');
select tap.settle_jobs((select id from _d), 'failed');
select tap.throws('23514', $$select public.discard_unconfirmed_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', (select id from _d))$$,
  'ilk turu açılmış çalışma alanı (başarısız bitse bile) kaldırılamaz', 'workspace_not_discardable');

create temp table _e on commit drop as
  select * from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Tur Koştu', 'tur-kostu', '', '', '', '', 'instagram', 'tur.kostu', '', '');
grant select on _e to service_role;
select tap.eq($$select status from public.request_panel_job((select id from _e), 'onb_fin_q', 'routine', false, '{}', null, null, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$, 'queued', 'E: haftalık tur');
select tap.settle_jobs((select id from _e), 'succeeded');
select tap.throws('23514', $$select public.discard_unconfirmed_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', (select id from _e))$$,
  'hesaba bakıştan başka iş koşmuş çalışma alanı kaldırılamaz', 'workspace_not_discardable');

-- Fixture çalışma alanı A onaylı sayılmaz ama izlenen rakip (ve içerik, koşu) taşır: gerçek veri, kaldırılamaz.
select tap.throws('23514', $$select public.discard_unconfirmed_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001')$$,
  'fixture çalışma alanı (gerçek veri) kaldırılamaz', 'workspace_not_discardable');
select tap.eq($$select count(*)::text from public.workspaces where slug in ('onayli', 'ilk-tur-kostu', 'tur-kostu', 'test-a')$$, '4', 'reddedilen kaldırmalar hiçbir şey silmedi');
