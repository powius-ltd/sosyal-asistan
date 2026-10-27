-- 0007_intel_v2 testi: abonelik faturalama, video analizi alanları, ses profili, haftalık plan + atomik kaydetme RPC'si, RLS.
-- Kimlikler için bkz. _fixture.sql (A: …0001, kendi hesap …c1, rakip …c2, içerik …d1 (kendi) / …d2 (rakip); B tarafı bbbbbbbb-…).

-- ── Koşular: billing + kesinleşme ──────────────────────────────────────────────
select tap.eq($$select billing from public.collection_runs where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'$$, 'metered', 'mevcut koşu varsayılan olarak metered');
select tap.eq($$with r as (insert into public.collection_runs (workspace_id, provider, kind) values ('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 'profile') returning usage_settled_at) select coalesce(usage_settled_at::text, 'NULL') from r$$, 'NULL',
  'yeni koşuda usage_settled_at NULL (kesinleşmedi)');
select tap.throws('23514', $$insert into public.collection_runs (workspace_id, provider, kind, billing) values ('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 'profile', 'subscription')$$,
  'abonelik yalnız gemini/claude_cli olabilir', 'collection_runs_subscription_provider');
select tap.throws('23514', $$insert into public.collection_runs (workspace_id, provider, kind, billing) values ('aaaaaaaa-0000-4000-8000-000000000001', 'gemini', 'video_analysis', 'ucretsiz')$$,
  'billing yalnız metered | subscription', 'collection_runs_billing_check');

set local role service_role;
do $$
declare
  r public.collection_runs;
begin
  r := public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'gemini', 0, '{"kind": "video_analysis", "billing": "subscription", "target_label": "agy · 1 video"}');
  perform tap.ok(r.billing = 'subscription' and r.reserved_usd = 0 and r.actual_usd is null and r.provider = 'gemini',
    'reserve_budget: abonelik koşusu 0 USD, actual_usd NULL, billing subscription');
  r := public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'claude_cli', 0, '{"kind": "llm_week_synthesis"}');
  perform tap.ok(r.billing = 'metered', 'reserve_budget: billing verilmezse metered (geri uyum)');
end $$;
select tap.throws('22023', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'gemini', 0, '{"kind": "video_analysis", "billing": "bedava"}')$$,
  'reserve_budget: bilinmeyen billing reddedilir', 'invalid_billing');
select tap.throws('23514', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'anthropic', 0, '{"kind": "llm_analysis", "billing": "subscription"}')$$,
  'reserve_budget: anthropic API abonelik olamaz (tablo check''i)', 'collection_runs_subscription_provider');
reset role;

-- ── İçerik analizi: yeni alanlar ───────────────────────────────────────────────
select tap.throws('23514', $$update public.content_analyses set hook_source = 'audio' where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$,
  'hook_source speech | screen_text | caption', 'content_analyses_hook_source_check');
select tap.throws('23514', $$update public.content_analyses set backend = 'openai' where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$,
  'backend agy | gemini-api', 'content_analyses_backend_check');
select tap.throws('23514', $$update public.content_analyses set edit_metrics = '[1]' where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$,
  'edit_metrics JSON nesne olmalı', 'content_analyses_edit_metrics_check');
select tap.throws('23514', $$update public.content_analyses set evidence_report = '"x"' where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$,
  'evidence_report JSON nesne olmalı', 'content_analyses_evidence_report_check');
select tap.throws('23503', $$update public.content_analyses set run_id = 'bbbbbbbb-0000-4000-8000-0000000000f1' where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$,
  'analiz başka çalışma alanının koşusuna bağlanamaz (bileşik FK)');
update public.content_analyses
   set hook_source = 'speech', backend = 'agy', run_id = 'aaaaaaaa-0000-4000-8000-0000000000f1',
       edit_metrics = '{"cutCount": 12}', evidence_report = '{"verified": true}'
 where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2';
delete from public.collection_runs where id = 'aaaaaaaa-0000-4000-8000-0000000000f1';
select tap.eq($$select coalesce(run_id::text, 'NULL') from public.content_analyses where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$, 'NULL',
  'koşu silinince analiz kalır, run_id NULL olur (set null)');

-- ── Workspace / rakip / içerik küçük ekleri ────────────────────────────────────
select tap.eq($$select coalesce(audience_timezone, 'NULL') from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'NULL', 'audience_timezone varsayılan NULL (timezone kullanılır)');
select tap.throws('23514', $$update public.workspaces set audience_timezone = '' where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'audience_timezone boş olamaz', 'workspaces_audience_timezone_check');
select tap.affects(1, $$update public.workspaces set audience_timezone = 'America/New_York', compliance_region = 'TR_US' where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'audience_timezone + TR_US yazılır');
select tap.throws('23514', $$update public.competitors set status_reason = repeat('x', 301) where id = 'aaaaaaaa-0000-4000-8000-0000000000c3'$$, 'status_reason ≤ 300 karakter', 'competitors_status_reason_check');
select tap.affects(1, $$update public.competitors set status_reason = 'hesap gizli' where id = 'aaaaaaaa-0000-4000-8000-0000000000c3'$$, 'rakip erişim sebebi yazılır');
select tap.eq($$select coauthors::text from public.content_items where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$, '{}', 'coauthors varsayılan boş dizi');
select tap.affects(1, $$update public.content_items set coauthors = array['ortak.yazar'] where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$, 'coauthors herkese açık kullanıcı adları yazılır');

-- ── Fikir: details + source ────────────────────────────────────────────────────
select tap.eq($$select concat_ws('/', details::text, source) from public.ideas where id = 'aaaaaaaa-0000-4000-8000-0000000000a9'$$, '{}/generated', 'fikir varsayılanları: details {} / source generated');
select tap.throws('23514', $$update public.ideas set details = '[]' where id = 'aaaaaaaa-0000-4000-8000-0000000000a9'$$, 'details JSON nesne olmalı', 'ideas_details_check');
select tap.throws('23514', $$update public.ideas set source = 'ai' where id = 'aaaaaaaa-0000-4000-8000-0000000000a9'$$, 'source generated | weekly_plan | manual', 'ideas_source_check');

-- ── Ses profili (fixture: A ve B hesaplarının birer profili var) ───────────────
select tap.throws('23505', $$insert into public.voice_profiles (workspace_id, social_account_id, platform, taxonomy_version, prompt_version) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 't', 'p')$$,
  'hesap başına tek güncel ses profili', 'voice_profiles_account_unique');
select tap.throws('23503', $$insert into public.voice_profiles (workspace_id, social_account_id, platform, taxonomy_version, prompt_version) values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000c1', 'instagram', 't', 'p')$$,
  'ses profili başka çalışma alanının hesabına bağlanamaz (bileşik FK)');
select tap.throws('23514', $$update public.voice_profiles set traits = '{}' where social_account_id = 'aaaaaaaa-0000-4000-8000-0000000000c1'$$, 'traits JSON dizi olmalı', 'voice_profiles_traits_check');
select tap.throws('23514', $$update public.voice_profiles set language = 'İngilizce' where social_account_id = 'aaaaaaaa-0000-4000-8000-0000000000c1'$$, 'dil kodu biçimi', 'voice_profiles_language_check');

-- ── Haftalık plan tabloları ────────────────────────────────────────────────────
select tap.throws('23514', $$insert into public.weekly_plans (workspace_id, week_start, sections, taxonomy_version, prompt_version) values ('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-07', '{}', 't', 'p')$$,
  'week_start Pazartesi olmalı (2026-10-07 Çarşamba)', 'weekly_plans_week_start_check');
select tap.throws('23514', $$insert into public.weekly_plans (workspace_id, week_start, status, sections, taxonomy_version, prompt_version) values ('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05', 'yayinda', '{}', 't', 'p')$$,
  'plan durumu draft | ready | archived', 'weekly_plans_status_check');

-- ── save_weekly_plan: atomik kaydetme ──────────────────────────────────────────
select set_config('test.payload', $j${
  "account_id": "aaaaaaaa-0000-4000-8000-0000000000c1",
  "summary": "Bu hafta uzun format dene.",
  "confidence": "low",
  "sections": {"winners": {}, "focus": {}, "schedule": {}, "avoid": {}, "review": {"status": "awaiting_publish_data"}},
  "taxonomy_version": "2026-10-v1",
  "prompt_version": "plan-v1",
  "model": "claude-test",
  "run_ids": [],
  "ideas": [
    {"title": "Plana giren fikir", "rationale": "Kanıtlı", "hook_type": "bold_claim", "hooks": ["h1", "h2", "h3"], "script_outline": ["a", "b"],
     "rank_score": 0.9, "details": {"script": "..."},
     "evidence": [{"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d1", "lift_at_creation": 2.4}, {"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d2", "lift_at_creation": 3.5}],
     "position": 1, "slot_at": "2026-10-06T11:00:00Z", "slot_note": "rakip sabit saat"},
    {"title": "Plana girmeyen fikir", "hooks": ["h1", "h2", "h3"],
     "evidence": [{"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d1", "lift_at_creation": 1.6}, {"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d2", "lift_at_creation": 3.1}]}
  ]
}$j$, true);

select tap.ok(not has_function_privilege('authenticated', 'public.save_weekly_plan(uuid, date, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.save_weekly_plan(uuid, date, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.save_weekly_plan(uuid, date, jsonb)', 'execute'),
  'save_weekly_plan: yalnız service role EXECUTE');

set local role service_role;
select tap.throws('22023', $$select public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-07', current_setting('test.payload')::jsonb)$$, 'Pazartesi olmayan hafta reddedilir', 'week_start_not_monday');
select tap.throws('22023', $$select public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05', '{"ideas": []}')$$, 'bölümler (sections) zorunlu', 'sections_required');
select tap.throws('P0002', $$select public.save_weekly_plan('cccccccc-0000-4000-8000-000000000001', '2026-10-05', current_setting('test.payload')::jsonb)$$, 'bilinmeyen workspace reddedilir', 'workspace_not_found');
select tap.throws('P0002', $$select public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05', jsonb_set(current_setting('test.payload')::jsonb, '{account_id}', '"bbbbbbbb-0000-4000-8000-0000000000c1"'))$$,
  'başka çalışma alanının hesabı plana bağlanamaz', 'account_not_found');
-- Bir fikirde tek kanıt: tüm işlem geri alınır (plan da fikirler de yazılmaz).
select tap.throws('22023', $$select public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05',
  jsonb_set(current_setting('test.payload')::jsonb, '{ideas,1,evidence}', '[{"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d1", "lift_at_creation": 2}]'))$$,
  'fikir ≥ 2 kanıt ister', 'idea_needs_two_evidence');
select tap.eq($$select count(*)::text from public.weekly_plans where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and week_start = '2026-10-05'$$, '0', 'başarısız kayıt plan satırı bırakmaz');
select tap.eq($$select count(*)::text from public.ideas where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and source = 'weekly_plan'$$, '0', 'başarısız kayıt fikir bırakmaz (atomik)');
-- Başka çalışma alanının içeriği kanıt gösterilirse ikinci fikirde patlar; birinci fikir de geri alınır.
select tap.throws('23503', $$select public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05',
  jsonb_set(current_setting('test.payload')::jsonb, '{ideas,1,evidence,0,content_item_id}', '"bbbbbbbb-0000-4000-8000-0000000000d1"'))$$,
  'başka çalışma alanının içeriği kanıt olamaz (bileşik FK)');
select tap.eq($$select count(*)::text from public.ideas where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and source = 'weekly_plan'$$, '0', 'kanıt hatasında ilk fikir de geri alınır (atomik)');
-- Aynı sıra iki fikirde: benzersizlik ihlali, hepsi geri alınır.
select tap.throws('23505', $$select public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05',
  jsonb_set(current_setting('test.payload')::jsonb, '{ideas,1,position}', '1'))$$,
  'plan içinde aynı sıra iki kez kullanılamaz', 'weekly_plan_items_position_key');

do $$
declare
  p public.weekly_plans;
begin
  p := public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05', current_setting('test.payload')::jsonb);
  perform tap.ok(p.week_start = '2026-10-05' and p.status = 'ready' and p.social_account_id = 'aaaaaaaa-0000-4000-8000-0000000000c1'
    and p.confidence = 'low' and p.sections -> 'review' ->> 'status' = 'awaiting_publish_data' and p.model = 'claude-test',
    'save_weekly_plan: plan satırı doğru alanlarla döner');
end $$;
select tap.eq($$select count(*)::text from public.ideas where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and source = 'weekly_plan'$$, '2', 'iki fikir yazıldı (source = weekly_plan)');
select tap.eq($$select count(*)::text from public.idea_evidence e join public.ideas i on i.id = e.idea_id where i.source = 'weekly_plan' and i.workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '4', 'her fikir 2 kanıtla yazıldı');
select tap.eq($$select count(*)::text from public.weekly_plan_items it join public.weekly_plans p on p.id = it.plan_id where p.workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and p.week_start = '2026-10-05'$$, '2', 'her fikir plana bağlandı (biri plana girdi, biri aday)');
select tap.eq($$select count(*)::text from public.weekly_plan_items it join public.weekly_plans p on p.id = it.plan_id where p.workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and p.week_start = '2026-10-05' and it.position is not null$$, '1', 'yalnız position verilen fikir plana girdi; diğeri aday (NULL)');
select tap.eq($$select concat_ws('/', it.position::text, it.slot_note, extract(hour from it.slot_at at time zone 'UTC')::text) from public.weekly_plan_items it join public.weekly_plans p on p.id = it.plan_id where p.workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and p.week_start = '2026-10-05' and it.position is not null$$, '1/rakip sabit saat/11', 'plan öğesi: sıra, slot notu ve slot anı');
select tap.eq($$select i.details ->> 'script' from public.weekly_plan_items it join public.weekly_plans p on p.id = it.plan_id join public.ideas i on i.id = it.idea_id where p.workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and p.week_start = '2026-10-05' and it.position = 1$$, '...', 'fikir ayrıntıları (details) yazıldı');

-- Yeniden üretim: plan güncellenir (tek satır); dokunulmamış (new) eski fikirler silinir, ilerletilenler korunur.
reset role;
update public.ideas set status = 'saved' where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and source = 'weekly_plan' and title = 'Plana giren fikir';
set local role service_role;
do $$
declare
  p public.weekly_plans;
begin
  p := public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05',
    jsonb_set(current_setting('test.payload')::jsonb, '{summary}', '"Güncellendi"'));
  perform tap.ok(p.summary = 'Güncellendi', 'yeniden üretimde plan güncellenir');
end $$;
select tap.eq($$select count(*)::text from public.weekly_plans where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and week_start = '2026-10-05'$$, '1', 'hafta başına tek plan (upsert)');
-- 2 yeni fikir + korunan 'saved' eski fikir = 3; eski 'new' fikir silindi.
select tap.eq($$select count(*)::text from public.ideas where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and source = 'weekly_plan'$$, '3', 'eski new fikir silindi, saved fikir korundu (2 yeni + 1 korunan)');
-- 0009 (d): korunan (saved) fikrin plan bağı KAYBOLMAZ; aday olarak (position/slot NULL) planda kalır.
select tap.eq($$select count(*)::text from public.weekly_plan_items it join public.weekly_plans p on p.id = it.plan_id where p.workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and p.week_start = '2026-10-05'$$, '3', 'plan öğeleri: 2 yeni + korunan saved fikrin bağı (3 öğe)');
select tap.eq($$select coalesce(it.position::text, 'NULL') || '/' || (it.slot_at is null)::text from public.weekly_plan_items it join public.weekly_plans p on p.id = it.plan_id join public.ideas i on i.id = it.idea_id where p.workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and p.week_start = '2026-10-05' and i.status = 'saved'$$, 'NULL/true',
  'korunan fikir aday olarak kalır (sıra ve slot temizlendi), plan bağını kaybetmez');
reset role;

-- 0009 (b) + (c): ölçülemeyen lift NULL yazılır (0 değil), sayı olmayan lift reddedilir; yayın işine bağlı fikir yeniden üretimde silinmez.
select set_config('test.payload2', $j${
  "sections": {"winners": {}, "focus": {}, "schedule": {}, "avoid": {}, "review": {}},
  "taxonomy_version": "2026-10-v1", "prompt_version": "plan-v1",
  "ideas": [
    {"title": "Lift ölçülemedi fikri", "hooks": ["h1"],
     "evidence": [{"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d1"}, {"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d2", "lift_at_creation": null}]},
    {"title": "Yayın işine bağlı fikir", "hooks": ["h1"],
     "evidence": [{"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d1", "lift_at_creation": 2.0}, {"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d2", "lift_at_creation": 1.0}]}
  ]
}$j$, true);
set local role service_role;
do $$ begin perform public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-12', current_setting('test.payload2')::jsonb); end $$;
select tap.eq($$select count(*)::text from public.idea_evidence e join public.ideas i on i.id = e.idea_id where i.title = 'Lift ölçülemedi fikri' and e.lift_at_creation is null$$, '2', 'ölçülemeyen lift (eksik ya da null) NULL yazılır, 0''a çevrilmez');
select tap.throws('22023', $$select public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-19', jsonb_set(current_setting('test.payload2')::jsonb, '{ideas,0,evidence,0,lift_at_creation}', '"abc"'))$$,
  'lift sayı değilse reddedilir', 'evidence_lift_invalid');
reset role;
insert into public.publish_jobs (id, workspace_id, social_account_id, platform, caption, scheduled_at, idea_id)
  select 'aaaaaaaa-0000-4000-8000-0000000000b8', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'Bağlı iş', now() + interval '2 days', i.id
    from public.ideas i where i.title = 'Yayın işine bağlı fikir';
set local role service_role;
do $$ begin perform public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-12', current_setting('test.payload2')::jsonb); end $$;
select tap.eq($$select count(*)::text from public.ideas where title = 'Yayın işine bağlı fikir'$$, '2', 'yayın işine bağlı fikir silinmedi (2 = korunan + yeni kopya)');
select tap.eq($$select count(*)::text from public.ideas where title = 'Lift ölçülemedi fikri'$$, '1', 'bağsız new fikir yeniden üretimde silindi, yenisi yazıldı');
select tap.eq($$select count(*)::text from public.publish_jobs where id = 'aaaaaaaa-0000-4000-8000-0000000000b8' and idea_id is not null$$, '1', 'yayın işinin fikir bağı kopmadı');
select tap.eq($$select count(*)::text from public.weekly_plan_items it join public.weekly_plans p on p.id = it.plan_id where p.workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and p.week_start = '2026-10-12'$$, '3', 'korunan fikir aday olarak planda kaldı (1 korunan + 2 yeni)');
reset role;
delete from public.weekly_plans where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and week_start in ('2026-10-12', '2026-10-19');
delete from public.publish_jobs where id = 'aaaaaaaa-0000-4000-8000-0000000000b8';
delete from public.ideas where title in ('Lift ölçülemedi fikri', 'Yayın işine bağlı fikir');

-- Hesap silinince plan kalır (social_account_id NULL), ses profili gider; plan silinince öğeleri gider, fikirler kalır.
delete from public.social_accounts where id = 'aaaaaaaa-0000-4000-8000-0000000000c1';
select tap.eq($$select coalesce(social_account_id::text, 'NULL') from public.weekly_plans where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and week_start = '2026-10-05'$$, 'NULL', 'hesap silinince plan kalır, social_account_id NULL olur');
select tap.eq($$select count(*)::text from public.voice_profiles where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '0', 'hesap silinince ses profili gider (cascade)');
delete from public.weekly_plans where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and week_start = '2026-10-05';
select tap.eq($$select count(*)::text from public.weekly_plan_items where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '1', 'plan silinince öğeleri gider (cascade); yalnız fixture planının öğesi kalır');
select tap.ok((select count(*) from public.ideas where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and source = 'weekly_plan') = 3, 'plan silinince fikirler kalır');

-- ── RLS: yeni tablolar (fixture: A ve B'nin birer ses profili, planı ve plan öğesi var) ──

select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a3'), true);
set local role authenticated;
select tap.eq($$select count(*)::text from public.weekly_plans$$, '1', 'viewer yalnız kendi çalışma alanının planını okur');
select tap.eq($$select count(*)::text from public.voice_profiles where workspace_id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, '0', 'A üyesi B''nin ses profilini görmez');
select tap.eq($$select count(*)::text from public.weekly_plan_items$$, '1', 'plan öğeleri: yalnız kendi çalışma alanı görünür');
select tap.throws('42501', $$insert into public.weekly_plans (workspace_id, week_start, sections, taxonomy_version, prompt_version) values ('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-19', '{}', 't', 'p')$$,
  'authenticated plan yazamaz (yalnız sunucu)');
select tap.throws('42501', $$update public.voice_profiles set summary = 'x'$$, 'authenticated ses profili yazamaz');
select tap.throws('42501', $$delete from public.weekly_plans$$, 'authenticated plan silemez');
reset role;
