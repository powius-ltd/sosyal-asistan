-- reserve_budget testi: tavan, grup paylaşımı, ay sınırı, mutabakat (greatest), hata yolları.
-- Fixture'daki A çalışma alanında bu ay 1 Apify koşusu var (reserved 0.5, actual 0.4 → sayılan 0.5).

update public.workspaces set apify_monthly_cap_usd = 1, llm_monthly_cap_usd = 1
 where id = 'aaaaaaaa-0000-4000-8000-000000000001';

set local role service_role;

-- Mutabakat: gerçek tutar rezerveyi aşarsa ay toplamında actual sayılır (greatest). Başka rezerve yokken sınanır
-- (yalnız fixture koşusu): actual 0.9 > reserved 0.5 → 0.9 + 0.2 > 1.0 reddedilir (yalnız reserved sayılsaydı 0.7 geçerdi).
update public.collection_runs set actual_usd = 0.9 where id = 'aaaaaaaa-0000-4000-8000-0000000000f1';
select tap.throws('P0001', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0.2, '{"kind": "content"}')$$,
  'actual (0.9) > reserved (0.5) ise ay toplamında actual sayılır', 'budget_exceeded');
update public.collection_runs set actual_usd = 0.4 where id = 'aaaaaaaa-0000-4000-8000-0000000000f1';

-- Dönen satır: rezerve edilmiş koşu, mutabakat YOK (actual_usd NULL, 0 değil).
do $$
declare
  r public.collection_runs;
begin
  r := public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0.4,
    '{"kind": "content", "target_label": "@x", "expected_results": 30, "external_run_id": "apify-1", "price_unknown": true}');
  perform tap.ok(r.status = 'reserved' and r.reserved_usd = 0.4 and r.actual_usd is null and r.price_unknown
    and r.expected_results = 30 and r.external_run_id = 'apify-1' and r.target_label = '@x' and r.kind = 'content'
    and r.workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and r.provider = 'apify',
    'reserve_budget: rezerve edilmiş koşu döner (actual_usd NULL)');
end $$;

-- Tavan aşılmış olsa bile (gerçek tutar rezerveyi çok aşmış: 3.0 > 1.0) yalnız 0 tutarlı ücretsiz çağrı geçer.
update public.collection_runs set actual_usd = 3 where id = 'aaaaaaaa-0000-4000-8000-0000000000f1';
select tap.affects(1, $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0, '{"kind": "content"}')$$,
  'tavan aşılmışken 0 tutarlı rezervasyon geçer');
select tap.throws('P0001', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0.01, '{"kind": "content"}')$$,
  'tavan aşılmışken paralı rezervasyon reddedilir', 'budget_exceeded');
update public.collection_runs set actual_usd = 0.4 where id = 'aaaaaaaa-0000-4000-8000-0000000000f1';

-- Tavan 1.00: sayılan greatest(0.4, 0.5) = 0.5 + 0.4 = 0.9.
select tap.throws('P0001', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0.2, '{"kind": "content"}')$$,
  'tavan aşılırsa budget_exceeded (0.9 + 0.2 > 1.0)', 'budget_exceeded');
select tap.eq($$select count(*)::text from public.collection_runs where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and provider = 'apify'$$, '3',
  'reddedilen rezervasyon satır bırakmaz');
select tap.affects(1, $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0.1, '{"kind": "content"}')$$,
  'tam tavana kadar (0.9 + 0.1 = 1.0) rezerve edilir');
select tap.throws('P0001', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0.000001, '{"kind": "content"}')$$,
  'tavan dolunca en küçük tutar bile reddedilir', 'budget_exceeded');
select tap.affects(1, $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0, '{"kind": "content"}')$$,
  'tutarı 0 olan rezervasyon tavana takılmaz');
select tap.affects(1, $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'graph_api', 0, '{"kind": "own_sync"}')$$,
  'graph_api tavansızdır (ücretsiz)');

-- Mutabakat: gerçek tutar rezerveyi aşarsa o sayılır (greatest); NULL actual rezerveyle sayılır.
update public.collection_runs set actual_usd = 3 where id = 'aaaaaaaa-0000-4000-8000-0000000000f1';
select tap.throws('P0001', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0.01, '{"kind": "content"}')$$,
  'actual > reserved ise ay toplamında actual sayılır', 'budget_exceeded');
-- Mutabakatta rezerve gerçek tutara indirilince (serbest bırakma) bütçe geri açılır: 0.4 + 0.1 sayılır, 0.5 daha sığar.
update public.collection_runs set actual_usd = 0, reserved_usd = 0 where id = 'aaaaaaaa-0000-4000-8000-0000000000f1';
select tap.affects(1, $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0.5, '{"kind": "content"}')$$,
  'serbest bırakılan rezerve bütçeyi geri açar (0.5 + 0.5 = 1.0)');
select tap.throws('P0001', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0.01, '{"kind": "content"}')$$,
  've tavan yine dolu', 'budget_exceeded');

-- LLM grubu (anthropic/openai/deepgram/gemini/claude_cli) tek tavanı paylaşır; Apify tavanından bağımsızdır.
select tap.affects(1, $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'anthropic', 0.7, '{"kind": "llm_analysis"}')$$, 'anthropic 0.7 rezerve');
select tap.throws('P0001', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'deepgram', 0.4, '{"kind": "transcription"}')$$,
  'deepgram aynı LLM tavanını paylaşır (0.7 + 0.4 > 1.0)', 'budget_exceeded');
select tap.affects(1, $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'openai', 0.3, '{"kind": "transcription"}')$$, 'openai 0.3 → LLM tavanı tam dolu');
select tap.affects(1, $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'claude_cli', 0, '{"kind": "llm_analysis"}')$$, 'claude_cli (abonelik, 0 USD) tavana takılmaz');

-- Tavan 0 = harcama kapalı: paralı koşu başlamaz.
reset role;
update public.workspaces set apify_monthly_cap_usd = 0 where id = 'bbbbbbbb-0000-4000-8000-000000000001';
set local role service_role;
select tap.throws('P0001', $$select public.reserve_budget('bbbbbbbb-0000-4000-8000-000000000001', 'apify', 0.01, '{"kind": "profile"}')$$,
  'tavan 0: paralı koşu başlamaz', 'budget_exceeded');
reset role;

-- Ay sınırı: workspace saat diliminde takvim ayı. Önceki ayın koşusu sayılmaz; ay başındaki sayılır.
update public.workspaces set apify_monthly_cap_usd = 1, timezone = 'Europe/Istanbul' where id = 'bbbbbbbb-0000-4000-8000-000000000001';
delete from public.collection_runs where workspace_id = 'bbbbbbbb-0000-4000-8000-000000000001';
insert into public.collection_runs (workspace_id, provider, kind, reserved_usd, started_at) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'apify', 'content', 100,
   (date_trunc('month', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul') - interval '1 minute'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'apify', 'content', 0.5,
   (date_trunc('month', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul'));
set local role service_role;
select tap.throws('P0001', $$select public.reserve_budget('bbbbbbbb-0000-4000-8000-000000000001', 'apify', 0.6, '{"kind": "content"}')$$,
  'ay başındaki koşu sayılır (0.5 + 0.6 > 1.0)', 'budget_exceeded');
select tap.affects(1, $$select public.reserve_budget('bbbbbbbb-0000-4000-8000-000000000001', 'apify', 0.5, '{"kind": "content"}')$$,
  'önceki ayın 100 USD koşusu sayılmaz (0.5 + 0.5 = 1.0)');

-- Hata yolları.
select tap.throws('22023', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'tiktok_api', 1, '{"kind": "content"}')$$, 'bilinmeyen sağlayıcı reddedilir', 'unknown_provider');
select tap.throws('22023', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', -1, '{"kind": "content"}')$$, 'negatif tutar reddedilir', 'invalid_amount');
select tap.throws('22023', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 'NaN'::numeric, '{"kind": "content"}')$$, 'NaN tutar reddedilir', 'invalid_amount');
select tap.throws('22023', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', null, '{"kind": "content"}')$$, 'NULL tutar reddedilir', 'invalid_argument');
select tap.throws('22023', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0.1, '{}')$$, 'run türü (kind) zorunlu', 'run_kind_required');
select tap.throws('22023', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0.1, '[]')$$, 'p_run nesne olmalı', 'invalid_argument');
select tap.throws('P0002', $$select public.reserve_budget('cccccccc-0000-4000-8000-000000000001', 'apify', 0.1, '{"kind": "content"}')$$, 'bilinmeyen çalışma alanı reddedilir', 'workspace_not_found');
select tap.throws('23514', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'graph_api', 0, '{"kind": "Geçersiz Tür"}')$$, 'run türü biçimi doğrulanır (collection_runs_kind_check)');
reset role;
