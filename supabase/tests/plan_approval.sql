-- 0035_plan_approval testi: `approve_weekly_plan` yalnız `ready` planı onaylar, plana giren `new` fikirleri `saved` yapar (aday ve ilerlemiş
-- fikirlere dokunmaz), onay verilince değişmez (idempotent); `save_weekly_plan` yeniden üretimde onayı sıfırlar; yetki yalnız service role.
-- Fixture (_fixture.sql): A çalışma alanı …0001 + kendi hesap …c1 + içerikler …d1, …d2 + kullanıcı …a1.

select set_config('test.payload', $j${
  "account_id": "aaaaaaaa-0000-4000-8000-0000000000c1",
  "summary": "Onay planı.",
  "confidence": "low",
  "sections": {"winners": {}, "focus": {}, "schedule": {}, "avoid": {}, "review": {}},
  "taxonomy_version": "2026-10-v1",
  "prompt_version": "plan-v1",
  "run_ids": [],
  "ideas": [
    {"title": "Planda A", "hooks": ["h1"], "position": 1,
     "evidence": [{"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d1"}, {"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d2"}]},
    {"title": "Planda B", "hooks": ["h1"], "position": 2,
     "evidence": [{"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d1"}, {"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d2"}]},
    {"title": "Aday", "hooks": ["h1"],
     "evidence": [{"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d1"}, {"content_item_id": "aaaaaaaa-0000-4000-8000-0000000000d2"}]}
  ]
}$j$, true);

set local role service_role;
select tap.throws('P0002', $$select public.approve_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05', null, now())$$, 'plan yoksa onaylanamaz', 'plan_not_found');

select public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05', jsonb_set(current_setting('test.payload')::jsonb, '{status}', '"draft"'));
select tap.throws('22023', $$select public.approve_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05', null, now())$$, 'taslak plan onaylanamaz', 'plan_not_ready');

select public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05', current_setting('test.payload')::jsonb);
select tap.eq($$select coalesce(approved_at::text, 'NULL') from public.weekly_plans where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and week_start = '2026-10-05'$$, 'NULL', 'yeni plan onaysız');

-- Plana giren fikirlerden biri bırakılmış olsun: onay ona dokunmaz.
update public.ideas set status = 'dismissed' where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and title = 'Planda B';

select public.approve_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05', 'aaaaaaaa-0000-4000-8000-0000000000a1', '2026-10-06 09:00+00');
select tap.eq($$select approved_at::text from public.weekly_plans where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and week_start = '2026-10-05'$$, '2026-10-06 09:00:00+00', 'onay anı yazıldı');
select tap.eq($$select status::text from public.ideas where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and title = 'Planda A'$$, 'saved', 'plana giren fikir seçildi');
select tap.eq($$select status::text from public.ideas where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and title = 'Planda B'$$, 'dismissed', 'bırakılmış fikre dokunulmadı');
select tap.eq($$select status::text from public.ideas where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and title = 'Aday'$$, 'new', 'aday fikir seçilmedi');

-- Onay değişmez: ikinci çağrı saati yeniden yazmaz.
select public.approve_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05', null, '2026-10-07 09:00+00');
select tap.eq($$select approved_at::text from public.weekly_plans where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and week_start = '2026-10-05'$$, '2026-10-06 09:00:00+00', 'ikinci onay ilkini bozmaz');

-- Yeniden üretim aynı satırı günceller ve onayı sıfırlar.
select public.save_weekly_plan('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-05', current_setting('test.payload')::jsonb);
select tap.eq($$select count(*)::text from public.weekly_plans where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and week_start = '2026-10-05'$$, '1', 'hafta başına tek plan satırı');
select tap.eq($$select coalesce(approved_at::text, 'NULL') || ':' || coalesce(approved_by::text, 'NULL') from public.weekly_plans where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and week_start = '2026-10-05'$$, 'NULL:NULL', 'yeniden üretim onayı sıfırlar');

-- Yetki: yalnız service role
reset role;
select tap.ok(not has_function_privilege('authenticated', 'public.approve_weekly_plan(uuid, date, uuid, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.approve_weekly_plan(uuid, date, uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.approve_weekly_plan(uuid, date, uuid, timestamptz)', 'execute'),
  '0035: approve_weekly_plan yalnız service role');
