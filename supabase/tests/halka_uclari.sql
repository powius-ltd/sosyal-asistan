-- 0025_halka_uclari testi: `save_weekly_plan` brifi (weekly_plans.brief) ve fikrin slotunu (weekly_plan_items.brief_slot) yazar;
-- brifsiz plan NULL bırakır; yeniden üretimde slot temizlenir; yetki aynen; panel_jobs'a `measure_zernio` ve `discover` türleri.
-- Fixture (_fixture.sql): A çalışma alanı + kendi hesap …c1 + içerikler …d1, …d2.

select set_config('test.payload', $j${
  "account_id": "aaaaaaaa-0000-4000-8000-0000000000c1",
  "summary": "Brifli plan.",
  "confidence": "low",
  "sections": {"winners": {}, "focus": {}, "schedule": {}, "avoid": {}, "review": {}},
  "taxonomy_version": "2026-10-v1",
  "prompt_version": "plan-v1",
  "run_ids": [],
  "brief": {"theme": "Test teması", "slots": [{"slotId": "S1"}, {"slotId": "S2"}]},
  "ideas": [
    {"title": "Slotlu fikir", "hooks": ["h1"], "position": 1, "brief_slot": "S1",
     "evidence": [{"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d1"}, {"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d2"}]},
    {"title": "Slotsuz aday", "hooks": ["h1"],
     "evidence": [{"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d1"}, {"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d2"}]}
  ]
}$j$, true);

-- Sütun kısıtları
select tap.throws('23514', $$update public.weekly_plans set brief = '[]' where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'brif nesne olmalı', 'weekly_plans_brief_check');

set local role service_role;
select tap.throws('22023', $$select public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05', jsonb_set(current_setting('test.payload')::jsonb, '{brief}', '"düz metin"'))$$, 'brif nesne değilse reddedilir', 'brief_must_be_object');
select tap.throws('23514', $$select public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05', jsonb_set(current_setting('test.payload')::jsonb, '{ideas,0,brief_slot}', '"X1"'))$$, 'slot biçimi S1..S9', 'weekly_plan_items_brief_slot_check');

select public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05', current_setting('test.payload')::jsonb);
select tap.eq($$select brief ->> 'theme' from public.weekly_plans where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and week_start = '2026-10-05'$$, 'Test teması', 'brif plan satırına yazıldı');
select tap.eq($$select i.title || ':' || coalesce(it.brief_slot, '-') from public.weekly_plan_items it join public.ideas i on i.id = it.idea_id where it.workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and i.title = 'Slotlu fikir'$$, 'Slotlu fikir:S1', 'fikrin slotu öğeye yazıldı');
select tap.eq($$select coalesce(it.brief_slot, 'NULL') from public.weekly_plan_items it join public.ideas i on i.id = it.idea_id where it.workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and i.title = 'Slotsuz aday'$$, 'NULL', 'aday öğenin slotu NULL');

-- Yeniden üretim brifsiz: brif NULL olur, slotlar temizlenir (eski brif yeni plana sızmaz).
select public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05', (current_setting('test.payload')::jsonb - 'brief') #- '{ideas,0,brief_slot}');
select tap.eq($$select coalesce(brief::text, 'NULL') from public.weekly_plans where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and week_start = '2026-10-05'$$, 'NULL', 'brifsiz yeniden üretim brifi NULL yapar');
select tap.eq($$select count(*)::text from public.weekly_plan_items where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and brief_slot is not null$$, '0', 'brifsiz yeniden üretimde slot kalmaz');

-- Yetki aynen
reset role;
select tap.ok(not has_function_privilege('authenticated', 'public.save_weekly_plan(uuid, date, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.save_weekly_plan(uuid, date, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.save_weekly_plan(uuid, date, jsonb)', 'execute'),
  '0025: save_weekly_plan yetkisi değişmedi (yalnız service role)');

-- panel_jobs: yeni türler
insert into public.panel_jobs (workspace_id, kind, status, finished_at) values ('aaaaaaaa-0000-4000-8000-000000000001', 'measure_zernio', 'cancelled', now());
select tap.eq($$select count(*)::text from public.panel_jobs where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and kind = 'measure_zernio'$$, '1', 'measure_zernio onaysız yazılır ($0)');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, dry_run) values ('aaaaaaaa-0000-4000-8000-000000000001', 'measure_zernio', true)$$, 'measure_zernio önizlemesi yok', 'panel_jobs_dry_run_kind');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_max_usd, approved_by, approved_at) values ('aaaaaaaa-0000-4000-8000-000000000001', 'measure_zernio', 'one_time', 0.5, 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$, 'measure_zernio harcamaz: USD onayı yazılmaz');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind) values ('aaaaaaaa-0000-4000-8000-000000000001', 'discover')$$, 'discover onaysız yazılamaz (KISIT 1)', 'panel_jobs_spend_needs_approval');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, dry_run) values ('aaaaaaaa-0000-4000-8000-000000000001', 'discover', true)$$, 'discover önizlemesi yok', 'panel_jobs_dry_run_kind');
insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_max_usd, approved_by, approved_at)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'discover', 'one_time', 0.25, 'aaaaaaaa-0000-4000-8000-0000000000a1', now());
select tap.eq($$select approved_max_usd::text from public.panel_jobs where kind = 'discover' and workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '0.250000', 'discover tek seferlik USD onayıyla yazılır');

-- panel_jobs: `order` (0026) — $0, onaysız, önizlemesiz
insert into public.panel_jobs (workspace_id, kind, params, status, finished_at) values ('aaaaaaaa-0000-4000-8000-000000000001', 'order', '{"week":"2026-10-19","slot":"P1"}', 'cancelled', now());
select tap.eq($$select count(*)::text from public.panel_jobs where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and kind = 'order'$$, '1', 'order onaysız yazılır ($0)');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, dry_run) values ('aaaaaaaa-0000-4000-8000-000000000001', 'order', true)$$, 'order önizlemesi yok', 'panel_jobs_dry_run_kind');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_max_usd, approved_by, approved_at) values ('aaaaaaaa-0000-4000-8000-000000000001', 'order', 'one_time', 0.5, 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$, 'order harcamaz: USD onayı yazılmaz');
