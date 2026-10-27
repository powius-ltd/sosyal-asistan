-- 0020_panel_job_credits testi: panel işlerinin kredi defterine bağlanması. İstekte atomik ayırma (yetmezse iş de yazılmaz), kredi onayı
-- ↔ USD onayı ayrımı (KISIT 1 kredi onayıyla aşılamaz), kredi tavanının değişmezliği, yetim iş / sıradaki iş iptalinde ayırmanın
-- bırakılması, süpürme (yazılı borç düşülür, borç yoksa bırakılır), eski girişin kredisiz davranışı.
-- Kimlikler (_fixture.sql): A sahibi …a1, A çalışma alanı aaaaaaaa-…-0001; B sahibi …b1, B çalışma alanı bbbbbbbb-…-0001.
-- Testler kendi kuyruğunu kullanır (`credit_q`); dosya tek transaction'da koşup geri alınır: gerçek hesaplara ve canlı kuyruğa dokunmaz.

create function tap.credit_state(p_owner uuid) returns text
language sql as $$
  select coalesce((select private.credit_available(a.id) from public.credit_accounts a where a.owner_user_id = p_owner), 0)::text
         || ':' || coalesce((select sum(h.amount) from public.credit_holds h join public.credit_accounts a on a.id = h.account_id
                              where a.owner_user_id = p_owner and h.status = 'open'), 0)::text
$$;
create function tap.job_hold(p_job uuid) returns text
language sql as $$
  select coalesce((select h.status || ':' || h.amount || ':' || coalesce(h.charged::text, '-') from public.credit_holds h
                    where h.idempotency_key = 'job:' || p_job::text), 'yok')
$$;

set local role service_role;
select tap.affects(1, $$select public.grant_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 'purchase', 100, 'pjc-grant')$$, 'A sahibine 100 kredi');

-- ── Eski giriş: kredisiz, 0016 davranışı ───────────────────────────────────────
do $$
declare
  j public.panel_jobs;
begin
  j := public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'credit_q', 'analyze', false, '{}', null, null, 'aaaaaaaa-0000-4000-8000-0000000000a1');
  perform tap.eq(format('select %L', concat_ws(':', j.status, coalesce(j.approval_basis, 'NULL'), coalesce(j.approved_max_credits::text, 'NULL'), tap.job_hold(j.id))),
    'queued:NULL:NULL:yok', 'request_panel_job (eski giriş): kredi ayırmaz, onay alanları boş');
  perform public.cancel_panel_job('aaaaaaaa-0000-4000-8000-000000000001', j.id);
end;
$$;
select tap.eq($$select tap.credit_state('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '100:0', 'kredisiz istek bakiyeye dokunmaz');
select tap.throws('22023', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'credit_q', 'analyze', false, '{}', 'credits', null, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'credits dayanağı doğrudan verilemez (yalnız kredi tavanından türetilir)', 'invalid_argument');

-- ── Atomik ayırma ──────────────────────────────────────────────────────────────
select tap.throws('P0001', $$select public.request_panel_job_credited('aaaaaaaa-0000-4000-8000-000000000001', 'credit_q', 'analyze', false, '{}', null, null,
    'aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 190)$$, 'kredi yetmezse iş isteği reddedilir', 'available=100 requested=190');
select tap.eq($$select count(*)::text from public.panel_jobs where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and status in ('queued', 'running')$$, '0',
  'yetersiz kredide iş satırı da YAZILMAZ (kuyrukta kredisiz iş kalmaz)');
select tap.eq($$select tap.credit_state('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '100:0', 'reddedilen istek ayırma bırakmaz');
select tap.throws('22023', $$select public.request_panel_job_credited('aaaaaaaa-0000-4000-8000-000000000001', 'credit_q', 'analyze', false, '{}', null, null,
    'aaaaaaaa-0000-4000-8000-0000000000a1', null, 60)$$, 'kredi tavanı hesap sahibi ister', 'invalid_argument');
select tap.throws('22023', $$select public.request_panel_job_credited('aaaaaaaa-0000-4000-8000-000000000001', 'credit_q', 'collect', true, '{}', null, null,
    'aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 8)$$, 'önizleme kredi ayırmaz', 'invalid_argument');
select tap.throws('23514', $$select public.request_panel_job_credited('aaaaaaaa-0000-4000-8000-000000000001', 'credit_q', 'collect', false, '{}', null, null,
    'aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 8)$$,
  'KISIT 1: kredi onayı USD onayının yerine geçmez (toplama yine tutar onayı ister)', 'panel_jobs_spend_needs_approval');
select tap.throws('23514', $$select public.request_panel_job_credited('aaaaaaaa-0000-4000-8000-000000000001', 'credit_q', 'plan', false, '{}', null, null,
    'aaaaaaaa-0000-4000-8000-0000000000a3', 'aaaaaaaa-0000-4000-8000-0000000000a1', 60)$$,
  'kredi onayını veren de sahip / editör üye olmalı', 'panel_job_approver_not_editor');
select tap.eq($$select tap.credit_state('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '100:0', 'reddedilen isteklerin hiçbiri kredi tutmadı');

-- Kredili iş: satır + ayırma birlikte; dayanak `credits`.
create temp table pjc (name text primary key, id uuid) on commit drop;
insert into pjc select 'plan', (public.request_panel_job_credited('aaaaaaaa-0000-4000-8000-000000000001', 'credit_q', 'plan', false, '{}', null, null,
  'aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 60)).id;
select tap.eq($$select concat_ws(':', j.status, j.approval_basis, j.approved_max_credits, coalesce(j.approved_max_usd::text, 'NULL'), j.approved_by, (j.approved_at is not null)::text)
                  from public.panel_jobs j join pjc on pjc.id = j.id where pjc.name = 'plan'$$,
  'queued:credits:60:NULL:aaaaaaaa-0000-4000-8000-0000000000a1:true', 'kredili iş: dayanak credits, tavan ve onaylayan yazılır, USD tutarı yok');
select tap.eq($$select tap.job_hold(id) from pjc where name = 'plan'$$, 'open:60:-', 'iş satırıyla birlikte ayırma açılır (anahtar job:<iş kimliği>)');
select tap.eq($$select (h.panel_job_id = pjc.id and h.workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001')::text from public.credit_holds h, pjc
                 where pjc.name = 'plan' and h.idempotency_key = 'job:' || pjc.id::text$$, 'true', 'ayırma işi ve çalışma alanını taşır');
select tap.eq($$select tap.credit_state('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '40:60', 'ayrılan kullanılabilirden düşer');
select tap.throws('23514', $$update public.panel_jobs set approved_max_credits = 9999 where id = (select id from pjc where name = 'plan')$$,
  'kredi tavanı sonradan değiştirilemez', 'panel_job_approval_immutable');

-- Sıradaki işin iptali: ayırma düşülmeden bırakılır.
select tap.eq($$select (public.cancel_panel_job('aaaaaaaa-0000-4000-8000-000000000001', (select id from pjc where name = 'plan'))).status$$, 'cancelled', 'sıradaki kredili iş iptal edilir');
select tap.eq($$select tap.job_hold(id) from pjc where name = 'plan'$$, 'released:60:-', 'iptal ayırmayı düşmeden bırakır');
select tap.eq($$select tap.credit_state('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '100:0', 'kredi geri açıldı');

-- ── USD onayı + kredi tavanı birlikte ──────────────────────────────────────────
insert into pjc select 'collect', (public.request_panel_job_credited('aaaaaaaa-0000-4000-8000-000000000001', 'credit_q', 'collect', false, '{}', 'one_time', 0.25,
  'aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 40)).id;
select tap.eq($$select concat_ws(':', j.approval_basis, j.approved_max_usd::numeric(6,2), j.approved_max_credits) from public.panel_jobs j join pjc on pjc.id = j.id where pjc.name = 'collect'$$,
  'one_time:0.25:40', 'USD onaylı işte dayanak USD''ninki kalır, kredi tavanı yanına yazılır');

-- ── Yetim iş: kapatılırken ayırma da bırakılır ─────────────────────────────────
select tap.eq($$select count(*)::text from public.claim_panel_job('credit_q', 'cw1')$$, '1', 'işçi kredili işi alır');
update public.panel_jobs set heartbeat_at = now() - interval '5 minutes' where id = (select id from pjc where name = 'collect');
select tap.eq($$select count(*)::text from public.claim_panel_job('credit_q', 'cw2')$$, '0', 'yetim iş kapatılır (kuyrukta başka iş yok)');
select tap.eq($$select j.status || ':' || (j.result ->> 'outcome') || ':' || tap.job_hold(j.id) from public.panel_jobs j join pjc on pjc.id = j.id where pjc.name = 'collect'$$,
  'failed:worker_lost:released:40:-', 'işçi kaybında iş kapanırken ayırması da bırakılır (kredi düşülmez)');
select tap.eq($$select tap.credit_state('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '100:0', 'yetim ayırma kalmadı');

-- Yanıt vermeyen çalışan işin iptali de aynı yolu kullanır.
insert into pjc select 'briefing', (public.request_panel_job_credited('aaaaaaaa-0000-4000-8000-000000000001', 'credit_q', 'briefing', false, '{}', null, null,
  'aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 4)).id;
select tap.eq($$select count(*)::text from public.claim_panel_job('credit_q', 'cw3')$$, '1', 'işçi notlar işini alır');
select tap.eq($$select (public.cancel_panel_job('aaaaaaaa-0000-4000-8000-000000000001', (select id from pjc where name = 'briefing'))).status || ':' ||
                       (select tap.job_hold(id) from pjc where name = 'briefing')$$, 'running:open:4:-', 'canlı çalışan işin iptali ayırmaya dokunmaz (işçi kapatır)');
update public.panel_jobs set heartbeat_at = now() - interval '5 minutes' where id = (select id from pjc where name = 'briefing');
select tap.eq($$select (public.cancel_panel_job('aaaaaaaa-0000-4000-8000-000000000001', (select id from pjc where name = 'briefing'))).status || ':' ||
                       (select tap.job_hold(id) from pjc where name = 'briefing')$$, 'failed:released:4:-', 'yanıt vermeyen işin iptali işi kapatır ve ayırmayı bırakır');

-- ── Süpürme: işi bitmiş, ayırması açık ─────────────────────────────────────────
-- (a) Sonucunda borç yazılı iş: borç düşülür. (b) Borç yazılmamış iş: ayırma bırakılır. (c) Başka kuyruğun işi: dokunulmaz.
insert into pjc select 'due', (public.request_panel_job_credited('aaaaaaaa-0000-4000-8000-000000000001', 'credit_q', 'analyze', false, '{}', null, null,
  'aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 40)).id;
select tap.eq($$select count(*)::text from public.claim_panel_job('credit_q', 'cw4')$$, '1', 'işçi inceleme işini alır');
update public.panel_jobs set status = 'partial', finished_at = now(),
       result = '{"outcome": "step_failed", "credits": {"reserved": 40, "due": 30, "units": {"video_review": 3}, "priceVersion": "2026-10-12"}}'
 where id = (select id from pjc where name = 'due');
insert into pjc select 'nodue', (public.request_panel_job_credited('aaaaaaaa-0000-4000-8000-000000000001', 'credit_q', 'plan', false, '{}', null, null,
  'aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 60)).id;
select tap.eq($$select count(*)::text from public.claim_panel_job('credit_q', 'cw5')$$, '1', 'işçi plan işini alır');
update public.panel_jobs set status = 'failed', finished_at = now(), result = '{"outcome": "error"}' where id = (select id from pjc where name = 'nodue');
select tap.affects(1, $$select public.grant_credits('bbbbbbbb-0000-4000-8000-0000000000b1', 'purchase', 20, 'pjc-grant-b')$$, 'B sahibine 20 kredi');
insert into pjc select 'other', (public.request_panel_job_credited('bbbbbbbb-0000-4000-8000-000000000001', 'credit_other_q', 'briefing', false, '{}', null, null,
  'bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-0000000000b1', 4)).id;
select tap.eq($$select count(*)::text from public.claim_panel_job('credit_other_q', 'cw6')$$, '1', 'başka kuyruğun işçisi işini alır');
update public.panel_jobs set status = 'succeeded', finished_at = now(), result = '{"credits": {"reserved": 4, "due": 4}}' where id = (select id from pjc where name = 'other');
select tap.eq($$select tap.credit_state('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '0:100', 'süpürmeden önce: iki açık ayırma (40 + 60) asılı');

select tap.eq($$select public.sweep_panel_job_credits('credit_q')::text$$, '2', 'süpürme yalnız kendi kuyruğunun iki açık ayırmasını kapatır');
select tap.eq($$select tap.job_hold(id) from pjc where name = 'due'$$, 'settled:40:30', 'yazılı borç (30) düşülür, kalanı (10) serbest kalır');
select tap.eq($$select string_agg(l.amount::text || ':' || (l.units ->> 'video_review') || ':' || l.price_version, ',') from public.credit_ledger l
                 where l.hold_id = (select h.id from public.credit_holds h, pjc where pjc.name = 'due' and h.idempotency_key = 'job:' || pjc.id::text)$$,
  '-30:3:2026-10-12', 'düşüm satırı birim sayısını ve fiyat sürümünü taşır');
select tap.eq($$select tap.job_hold(id) from pjc where name = 'nodue'$$, 'released:60:-', 'borç yazılmamış işin ayırması bırakılır');
select tap.eq($$select tap.job_hold(id) from pjc where name = 'other'$$, 'open:4:-', 'başka kuyruğun ayırmasına dokunulmaz');
select tap.eq($$select tap.credit_state('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '70:0', 'bakiye 100 − 30 = 70; açık ayırma yok');
select tap.eq($$select public.sweep_panel_job_credits('credit_q')::text$$, '0', 'süpürme idempotent: ikinci çağrı hiçbir şey kapatmaz');
select tap.eq($$select public.sweep_panel_job_credits('credit_other_q')::text || ':' || (select tap.job_hold(id) from pjc where name = 'other')$$, '1:settled:4:4',
  'kendi kuyruğunun süpürmesi borcu düşer');
set constraints all immediate;
set constraints all deferred;
reset role;

-- ── Yetki ──────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a1'), true);
set local role authenticated;
select tap.throws('42501', $$select public.request_panel_job_credited('aaaaaaaa-0000-4000-8000-000000000001', 'credit_q', 'plan', false, '{}', null, null,
    'aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 60)$$, 'üye kredili iş isteği RPC''sini çağıramaz');
select tap.throws('42501', $$select public.sweep_panel_job_credits('credit_q')$$, 'üye süpürme çağıramaz');
select tap.throws('42501', $$select approved_max_credits from public.panel_jobs limit 1$$, 'üye kredi tavanı sütununu okuyamaz (yönetici bilgisi)');
reset role;
