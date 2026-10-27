-- 0012_agent_briefings testi: Analist brifingi (şekil kısıtları, 1–5 madde, bileşik FK kiracı tutarlılığı, set null, en yeni satır, RLS).
-- Fixture (_fixture.sql): A ve B'nin birer brifingi var (…e1); A'nın koşusu …f1. Kimlikler için bkz. _fixture.sql.

-- ── Şekil kısıtları ────────────────────────────────────────────────────────────
select tap.eq($$select count(*)::text from public.agent_briefings where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '1', 'fixture: A''da tek brifing var');
select tap.throws('23514', $$insert into public.agent_briefings (workspace_id, agent, payload, basis, prompt_version, persona_version)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'Analist', '{"schemaVersion":1,"items":[{"kind":"worked"}]}', '{}', 'p', 'q')$$,
  'rol adı küçük harf/rakam/alt çizgi biçiminde olmalı', 'agent_briefings_agent_check');
select tap.throws('23514', $$insert into public.agent_briefings (workspace_id, agent, payload, basis, prompt_version, persona_version)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyst', '{"schemaVersion":1,"items":[]}', '{}', 'p', 'q')$$,
  'boş brifing yazılmaz (en az 1 madde)', 'agent_briefings_payload_check');
select tap.throws('23514', $$insert into public.agent_briefings (workspace_id, agent, payload, basis, prompt_version, persona_version)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyst', '{"schemaVersion":1,"items":[{},{},{},{},{},{}]}', '{}', 'p', 'q')$$,
  'en çok 5 madde', 'agent_briefings_payload_check');
select tap.throws('23514', $$insert into public.agent_briefings (workspace_id, agent, payload, basis, prompt_version, persona_version)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyst', '[1]', '{}', 'p', 'q')$$,
  'payload nesne olmalı', 'agent_briefings_payload_check');
select tap.throws('23514', $$insert into public.agent_briefings (workspace_id, agent, payload, basis, prompt_version, persona_version)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyst', '{"items":[{}]}', '[]', 'p', 'q')$$,
  'basis nesne olmalı', 'agent_briefings_basis_check');
select tap.throws('23514', $$insert into public.agent_briefings (workspace_id, agent, payload, basis, prompt_version, persona_version)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyst', '{"items":[{}]}', '{}', ' ', 'q')$$,
  'prompt sürümü boş olamaz', 'agent_briefings_prompt_version_check');
select tap.throws('23514', $$insert into public.agent_briefings (workspace_id, agent, payload, basis, prompt_version, persona_version)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyst', '{"items":[{}]}', '{}', 'p', '')$$,
  'persona sürümü boş olamaz', 'agent_briefings_persona_version_check');

-- Bileşik FK: başka çalışma alanının koşusu bu çalışma alanının brifingine bağlanamaz (kiracı tutarlılığı).
select tap.throws('23503', $$insert into public.agent_briefings (workspace_id, agent, payload, basis, prompt_version, persona_version, run_id)
  values ('bbbbbbbb-0000-4000-8000-000000000001', 'analyst', '{"items":[{}]}', '{}', 'p', 'q', 'aaaaaaaa-0000-4000-8000-0000000000f1')$$,
  'B brifingi A''nın koşusuna bağlanamaz', 'agent_briefings_run_fkey');

-- ── Geçmiş + en yeni satır ─────────────────────────────────────────────────────
insert into public.agent_briefings (id, workspace_id, agent, generated_at, payload, basis, prompt_version, persona_version, run_id)
  values ('aaaaaaaa-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-000000000001', 'analyst', '2026-10-01T09:00:00Z',
    '{"schemaVersion":1,"items":[{"kind":"pending","headline":"Yeni","body":"Yeni brifing.","evidence":["plan:2026-09-28"],"confidence":"low"}]}',
    '{"analyzedCount":5,"labeledCount":2,"planWeek":"2026-09-28"}', 'briefing-v1', 'persona-v1', 'aaaaaaaa-0000-4000-8000-0000000000f1');
select tap.eq($$select count(*)::text from public.agent_briefings where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '2', 'her koşu yeni satır yazar (geçmiş kalır)');
select tap.eq($$select id::text from public.agent_briefings where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and agent = 'analyst' order by generated_at desc limit 1$$,
  'aaaaaaaa-0000-4000-8000-0000000000e2', 'getLatestBriefing sorgusu: en yeni satır');

-- ── Silme davranışı ────────────────────────────────────────────────────────────
delete from public.collection_runs where id = 'aaaaaaaa-0000-4000-8000-0000000000f1';
select tap.eq($$select coalesce(run_id::text, 'NULL') from public.agent_briefings where id = 'aaaaaaaa-0000-4000-8000-0000000000e2'$$, 'NULL',
  'koşu silinince brifing kalır, run_id NULL olur (set null)');

-- ── RLS ────────────────────────────────────────────────────────────────────────
select tap.ok(has_table_privilege('service_role', 'public.agent_briefings', 'insert') and has_table_privilege('authenticated', 'public.agent_briefings', 'select')
  and not has_table_privilege('authenticated', 'public.agent_briefings', 'insert')
  and not has_table_privilege('authenticated', 'public.agent_briefings', 'update')
  and not has_table_privilege('authenticated', 'public.agent_briefings', 'delete')
  and not has_table_privilege('anon', 'public.agent_briefings', 'select'),
  'yetki matrisi: service role yazar, authenticated yalnız okur, anon hiçbir şey');

select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a3'), true);
set local role authenticated;
select tap.eq($$select count(*)::text from public.agent_briefings$$, '2', 'viewer yalnız kendi çalışma alanının brifinglerini okur');
select tap.eq($$select count(*)::text from public.agent_briefings where workspace_id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, '0', 'A üyesi B''nin brifingini görmez');
select tap.throws('42501', $$insert into public.agent_briefings (workspace_id, agent, payload, basis, prompt_version, persona_version)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'analyst', '{"items":[{}]}', '{}', 'p', 'q')$$, 'authenticated brifing yazamaz (yalnız sunucu)');
select tap.throws('42501', $$update public.agent_briefings set model = 'x'$$, 'authenticated brifingi değiştiremez');
select tap.throws('42501', $$delete from public.agent_briefings$$, 'authenticated brifingi silemez');
reset role;

select set_config('request.jwt.claims', tap.claims('bbbbbbbb-0000-4000-8000-0000000000b1'), true);
set local role authenticated;
select tap.eq($$select count(*)::text from public.agent_briefings$$, '1', 'B üyesi yalnız kendi brifingini okur (A''nın 2 satırı görünmez)');
reset role;

set local role anon;
select tap.throws('42501', $$select count(*) from public.agent_briefings$$, 'anon brifingi okuyamaz (permission denied)');
reset role;
