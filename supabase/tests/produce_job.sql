-- 0034_produce_job testi: panel_jobs'a `produce` türü (SPN-33): HARCAMA türüdür (onaysız yazılamaz), kuru koşusu yok, kredi onayı yetmez,
-- tek seferlik USD onayıyla yazılır. Fixture (_fixture.sql): A çalışma alanı …0001, sahip …a1.

set local role service_role;

select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, params) values ('aaaaaaaa-0000-4000-8000-000000000001', 'produce', '{"orderId":"44444444-4444-4444-8444-444444444444"}')$$, 'produce onaysız yazılamaz (KISIT 1)', 'panel_jobs_spend_needs_approval');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, dry_run) values ('aaaaaaaa-0000-4000-8000-000000000001', 'produce', true)$$, 'produce önizlemesi yok', 'panel_jobs_dry_run_kind');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_max_credits, approved_by, approved_at) values ('aaaaaaaa-0000-4000-8000-000000000001', 'produce', 'credits', 10, 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$, 'produce: kredi onayı USD onayının yerine geçmez', 'panel_jobs_spend_needs_approval');

insert into public.panel_jobs (workspace_id, kind, params, approval_basis, approved_max_usd, approved_by, approved_at)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'produce', '{"orderId":"44444444-4444-4444-8444-444444444444"}', 'one_time', 0.5, 'aaaaaaaa-0000-4000-8000-0000000000a1', now());
select tap.eq($$select approved_max_usd::text from public.panel_jobs where kind = 'produce' and workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '0.500000', 'produce tek seferlik USD onayıyla yazılır');

reset role;
