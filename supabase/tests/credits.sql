-- 0017_credits testi: kredi defteri. Ver → ayır → kesinleştir → bakiye; iki kova sırası (önce aylık); süresi dolmuş kredi harcanamaz;
-- eksi bakiye İMKÂNSIZ (RPC + doğrudan yazım); defter DEĞİŞMEZ; her RPC idempotent; iş başına tek açık ayırma; yetki + RLS; ayrıca
-- `reserve_budget`'in koşu satırına model / iş bağı yazması.
-- Kimlikler (_fixture.sql): A sahibi …a1, B sahibi …b1; A çalışma alanı aaaaaaaa-…-0001; A'da bitmiş panel işi …b7.
-- Dosya tek transaction'da koşup geri alınır: gerçek hesapların bakiyesine dokunmaz.

create function tap.credit_available(p_owner uuid) returns text
language sql as $$
  select coalesce((select private.credit_available(a.id) from public.credit_accounts a where a.owner_user_id = p_owner), 0)::text
$$;

set local role service_role;

-- ── Ver ────────────────────────────────────────────────────────────────────────
select tap.eq($$select tap.credit_available('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '0', 'hesabı olmayan kullanıcının bakiyesi 0');
select tap.throws('P0001', $$select public.reserve_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 1, 'no-account')$$,
  'hesabı olmayan kullanıcı ayıramaz', 'insufficient_credits');
select tap.affects(1, $$select public.grant_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 'grant_monthly', 100, 'grant-m1', null, now() + interval '10 days')$$,
  'aylık kredi verilir (hesap ilk vermede açılır)');
select tap.affects(1, $$select public.grant_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 'purchase', 50, 'grant-p1')$$,
  'ek kredi verilir');
select tap.eq($$select bucket || ':' || (expires_at > now() + interval '364 days')::text from public.credit_ledger where idempotency_key = 'grant-p1'$$,
  'purchased:true', 'ek kredi: kova purchased, süre verilmezse 12 ay');
select tap.eq($$select tap.credit_available('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '150', 'bakiye = verilenlerin toplamı');
select tap.eq($$select count(*)::text from public.credit_accounts$$, '1', 'kullanıcı başına tek hesap');

-- İdempotency: aynı anahtar ikinci kez vermez; farklı tutarla çakışır.
select tap.eq($$select (public.grant_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 'purchase', 50, 'grant-p1')).id::text$$,
  (select id::text from public.credit_ledger where idempotency_key = 'grant-p1'), 'aynı anahtarla ikinci verme ilk satırı döndürür');
select tap.eq($$select tap.credit_available('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '150', 'ikinci verme bakiyeyi artırmaz');
select tap.throws('22023', $$select public.grant_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 'purchase', 51, 'grant-p1')$$,
  'aynı anahtar farklı tutarla reddedilir', 'credit_idempotency_conflict');
select tap.throws('22023', $$select public.grant_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 'grant_monthly', 10, 'grant-m-noexp')$$,
  'aylık kredi dönem sonu ister', 'credit_expiry_required');
select tap.throws('22023', $$select public.grant_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 'charge', 10, 'grant-bad-type')$$,
  'verme yalnız grant_monthly / purchase / adjust', 'credit_invalid_type');
select tap.throws('22023', $$select public.grant_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 'adjust', 0, 'grant-zero')$$,
  'sıfır / eksi kredi verilemez', 'credit_invalid_amount');
select tap.throws('23503', $$select public.grant_credits('dddddddd-0000-4000-8000-0000000000a1', 'adjust', 5, 'grant-no-user')$$,
  'olmayan kullanıcıya kredi verilemez (FK)');

-- ── Ayır: önce aylık kova ──────────────────────────────────────────────────────
select tap.affects(1, $$select public.reserve_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 120, 'job-1', 'aaaaaaaa-0000-4000-8000-000000000001')$$,
  '120 kredi ayrılır');
select tap.eq($$select string_agg(l.bucket || '=' || a.amount, ',' order by l.bucket)
                  from public.credit_hold_allocations a join public.credit_ledger l on l.id = a.lot_id
                  join public.credit_holds h on h.id = a.hold_id where h.idempotency_key = 'job-1'$$,
  'monthly=100,purchased=20', 'ayırma önce aylık kovayı, kalanını ek krediden tutar');
select tap.eq($$select tap.credit_available('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '30', 'kullanılabilir = defter − açık ayırma');
select tap.eq($$select (public.reserve_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 120, 'job-1')).status$$, 'open',
  'aynı anahtarla ikinci ayırma ilk ayırmayı döndürür');
select tap.eq($$select count(*)::text || ':' || tap.credit_available('aaaaaaaa-0000-4000-8000-0000000000a1') from public.credit_holds$$, '1:30',
  'ikinci ayırma çağrısı yeni satır yazmaz, bakiyeyi düşürmez');
select tap.throws('22023', $$select public.reserve_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 10, 'job-1')$$,
  'aynı anahtar farklı tutarla reddedilir', 'credit_idempotency_conflict');
select tap.throws('P0001', $$select public.reserve_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 31, 'job-big')$$,
  'yetmezse insufficient_credits (30 var, 31 istendi)', 'available=30 requested=31');
select tap.eq($$select count(*)::text from public.credit_holds$$, '1', 'reddedilen ayırma satır bırakmaz');
select tap.throws('22023', $$select public.reserve_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 0, 'job-zero')$$,
  'sıfır kredi ayrılamaz', 'credit_invalid_amount');

-- ── Kesinleştir: gerçekleşen ≤ ayrılan, fark serbest, kovalara bölünür ──────────
select tap.throws('22023', $$select public.settle_credits('job-1', 121)$$, 'gerçekleşen ayrılanı aşamaz', 'credit_settle_exceeds_hold');
select tap.throws('22023', $$select public.settle_credits('job-1', -1)$$, 'gerçekleşen negatif olamaz', 'credit_invalid_amount');
select tap.eq($$select (h).status || ':' || (h).charged from (select public.settle_credits('job-1', 105, '{"video_review": 10, "briefing": 1}', '2026-10-12') as h) s$$,
  'settled:105', '105 kredi kesinleşir');
select tap.eq($$select string_agg(bucket || '=' || amount, ',' order by bucket) from public.credit_ledger where entry_type = 'charge'$$,
  'monthly=-100,purchased=-5', 'düşüm kovalara bölünür: önce aylık (100), kalan ek krediden (5)');
select tap.eq($$select tap.credit_available('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '45', 'fark (15) anında serbest kalır: 150 − 105 = 45');
select tap.eq($$select sum(amount)::text from public.credit_ledger$$, '45', 'defter toplamı = bakiye (açık ayırma yokken)');
select tap.eq($$select count(distinct units::text)::text || ':' || min(price_version) || ':' || count(distinct workspace_id)::text
                  from public.credit_ledger where entry_type = 'charge'$$,
  '1:2026-10-12:1', 'düşüm satırı birim sayısını, fiyat sürümünü ve çalışma alanını taşır');
select tap.eq($$select (h).status || ':' || (h).charged from (select public.settle_credits('job-1', 10) as h) s$$,
  'settled:105', 'ikinci kesinleştirme ilk sonucu döndürür');
select tap.eq($$select count(*)::text || ':' || tap.credit_available('aaaaaaaa-0000-4000-8000-0000000000a1') from public.credit_ledger where entry_type = 'charge'$$,
  '2:45', 'ikinci kesinleştirme çift düşmez');
select tap.eq($$select (public.release_credits('job-1')).status$$, 'settled', 'kesinleşmiş ayırmayı bırakmak düşümü geri almaz');
select tap.eq($$select tap.credit_available('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '45', 'bakiye değişmedi');

-- Sıfır gerçekleşen: ayırma kapanır, düşüm satırı yazılmaz.
select tap.affects(1, $$select public.reserve_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 20, 'job-0')$$, 'ayır (20)');
select tap.eq($$select (h).status || ':' || (h).charged from (select public.settle_credits('job-0', 0) as h) s$$, 'settled:0', 'sıfır kesinleşir');
select tap.eq($$select count(*)::text || ':' || tap.credit_available('aaaaaaaa-0000-4000-8000-0000000000a1') from public.credit_ledger where entry_type = 'charge'$$,
  '2:45', 'sıfır kesinleşme düşüm yazmaz, ayrılanın tamamı serbest');

-- ── Bırak ──────────────────────────────────────────────────────────────────────
select tap.affects(1, $$select public.reserve_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 45, 'job-2')$$, 'kalanın tamamı ayrılır (45)');
select tap.eq($$select tap.credit_available('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '0', 'kullanılabilir 0');
select tap.throws('P0001', $$select public.reserve_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 1, 'job-3')$$,
  'bakiye tamamen ayrılmışken 1 kredi bile ayrılamaz', 'insufficient_credits');
select tap.eq($$select (public.release_credits('job-2')).status$$, 'released', 'ayırma bırakılır');
select tap.eq($$select (public.release_credits('job-2')).status || ':' || tap.credit_available('aaaaaaaa-0000-4000-8000-0000000000a1')$$, 'released:45',
  'ikinci bırakma aynı sonucu döndürür; kredi geri açıldı');
select tap.throws('23514', $$select public.settle_credits('job-2', 5)$$, 'bırakılmış ayırma kesinleştirilemez', 'credit_hold_released');
select tap.throws('P0002', $$select public.settle_credits('yok', 1)$$, 'olmayan ayırma kesinleştirilemez', 'credit_hold_not_found');
select tap.throws('P0002', $$select public.release_credits('yok')$$, 'olmayan ayırma bırakılamaz', 'credit_hold_not_found');

-- ── Süresi dolmuş kredi harcanamaz ─────────────────────────────────────────────
select tap.affects(1, $$select public.grant_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 'grant_monthly', 40, 'grant-dead', null, now() - interval '1 minute')$$,
  'süresi geçmiş parti yazılır');
select tap.eq($$select tap.credit_available('aaaaaaaa-0000-4000-8000-0000000000a1') || ':' || sum(amount) from public.credit_ledger$$, '45:85',
  'süresi dolmuş kredi defterde durur (85) ama bakiyeye girmez (45)');
select tap.throws('P0001', $$select public.reserve_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 46, 'job-dead')$$,
  'süresi dolmuş kredi ayrılamaz', 'available=45 requested=46');
select tap.throws('23514', $$insert into public.credit_hold_allocations (hold_id, account_id, lot_id, amount)
    select h.id, h.account_id, l.id, 1 from public.credit_holds h, public.credit_ledger l where h.idempotency_key = 'job-2' and l.idempotency_key = 'grant-dead'$$,
  'kapanmış ayırmaya dağılım yazılamaz', 'credit_hold_closed');

-- ── Eksi bakiye imkânsız (RPC dışı doğrudan yazım dahil) ───────────────────────
select tap.affects(1, $$select public.reserve_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 40, 'job-4')$$, 'ayır (40; serbest 5 kalır)');
select tap.throws('23514', $$insert into public.credit_ledger (account_id, entry_type, amount, bucket, lot_id, hold_id, idempotency_key)
    select l.account_id, 'charge', -46, l.bucket, l.id, (select id from public.credit_holds where idempotency_key = 'job-1'), 'direct-overdraw'
      from public.credit_ledger l where l.idempotency_key = 'grant-p1'$$,
  'doğrudan düşüm partinin kalanını aşamaz', 'credit_negative_balance');
select tap.throws('23514', $$insert into public.credit_ledger (account_id, entry_type, amount, bucket, lot_id, idempotency_key)
    select l.account_id, 'adjust', -6, l.bucket, l.id, 'direct-held' from public.credit_ledger l where l.idempotency_key = 'grant-p1'$$,
  'doğrudan düşüm AYRILMIŞ krediyi de tüketemez (serbest 5, istenen 6)', 'credit_negative_balance');
select tap.throws('23514', $$insert into public.credit_hold_allocations (hold_id, account_id, lot_id, amount)
    select h.id, h.account_id, l.id, 6 from public.credit_holds h, public.credit_ledger l where h.idempotency_key = 'job-4' and l.idempotency_key = 'grant-p1'$$,
  'doğrudan dağılım partinin serbest kalanını aşamaz');
select tap.throws('23514', $$insert into public.credit_ledger (account_id, entry_type, amount, bucket, idempotency_key)
    select account_id, 'expire', -1, 'monthly', 'direct-no-lot' from public.credit_ledger where idempotency_key = 'grant-p1'$$,
  'partisiz düşüm yazılamaz', 'credit_ledger_shape');
select tap.throws('23514', $$insert into public.credit_ledger (account_id, entry_type, amount, bucket, expires_at, idempotency_key)
    select account_id, 'grant_monthly', -5, 'monthly', now() + interval '1 day', 'direct-neg-grant' from public.credit_ledger where idempotency_key = 'grant-p1'$$,
  'eksi tutarlı verme yazılamaz', 'credit_ledger_shape');
select tap.throws('23505', $$insert into public.credit_ledger (account_id, entry_type, amount, bucket, expires_at, idempotency_key)
    select account_id, 'purchase', 5, 'purchased', now() + interval '1 day', 'grant-p1' from public.credit_ledger where idempotency_key = 'grant-p1'$$,
  'idempotency anahtarı benzersiz');
select tap.eq($$select (public.release_credits('job-4')).status$$, 'released', 'ayırma bırakılır');

-- ── İş başına tek açık ayırma ──────────────────────────────────────────────────
select tap.affects(1, $$select public.reserve_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 5, 'job-b7', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b7')$$,
  'işe bağlı ayırma');
select tap.throws('23505', $$select public.reserve_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 5, 'job-b7-again', null, 'aaaaaaaa-0000-4000-8000-0000000000b7')$$,
  'aynı iş için ikinci açık ayırma yok', 'credit_hold_active');
select tap.eq($$select (public.settle_credits('job-b7', 5, '{"briefing": 1}', '2026-10-12')).status$$, 'settled', 'kesinleşir');
select tap.eq($$select panel_job_id::text from public.credit_ledger where hold_id = (select id from public.credit_holds where idempotency_key = 'job-b7')$$,
  'aaaaaaaa-0000-4000-8000-0000000000b7', 'düşüm satırı işi taşır');
select tap.eq($$select tap.credit_available('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '40', 'bakiye 45 − 5 = 40');

-- ── Defter değişmez ────────────────────────────────────────────────────────────
select tap.throws('42501', $$update public.credit_ledger set amount = 999 where idempotency_key = 'grant-p1'$$, 'service role defteri güncelleyemez (yetki yok)');
select tap.throws('42501', $$delete from public.credit_ledger where idempotency_key = 'grant-p1'$$, 'service role defter satırı silemez (yetki yok)');
select tap.throws('42501', $$update public.credit_hold_allocations set amount = 1$$, 'service role dağılımı güncelleyemez');
select tap.throws('42501', $$delete from public.credit_hold_allocations$$, 'service role dağılım silemez');
select tap.throws('42501', $$delete from public.credit_holds$$, 'service role ayırma silemez');
select tap.throws('42501', $$truncate public.credit_ledger cascade$$, 'service role defteri boşaltamaz');
select tap.throws('23514', $$update public.credit_holds set amount = 1 where idempotency_key = 'job-1'$$, 'ayırma tutarı değişmez', 'credit_hold_immutable');
select tap.throws('23514', $$update public.credit_holds set status = 'open', charged = null, closed_at = null where idempotency_key = 'job-1'$$,
  'kapanmış ayırma yeniden açılamaz', 'credit_hold_closed');
reset role;
select tap.throws('23514', $$update public.credit_ledger set amount = 999 where idempotency_key = 'grant-p1'$$, 'tablo sahibi de güncelleyemez (trigger)', 'credit_ledger_immutable');
select tap.throws('23514', $$update public.credit_ledger set note = 'x' where idempotency_key = 'grant-p1'$$, 'not bile değişmez', 'credit_ledger_immutable');
select tap.throws('23514', $$delete from public.credit_ledger where idempotency_key = 'grant-p1'$$, 'tablo sahibi de silemez (trigger)', 'credit_ledger_immutable');
select tap.throws('23514', $$update public.credit_hold_allocations set amount = 1$$, 'dağılım değişmez (trigger)', 'credit_allocation_immutable');
-- Ertelenmiş "kesinleşen = düşülen" denetimleri (0019) burada çalıştırılır: bekleyen trigger olayı varken TRUNCATE başka hatayla durur.
set constraints all immediate;
set constraints all deferred;
select tap.throws('23514', $$truncate public.credit_accounts cascade$$, 'defter TRUNCATE ile de boşaltılamaz (tablo sahibi dahil)', 'credit_ledger_immutable');

-- ── Yetki + RLS ────────────────────────────────────────────────────────────────
select tap.affects(1, $$select public.grant_credits('bbbbbbbb-0000-4000-8000-0000000000b1', 'adjust', 7, 'grant-b1')$$, 'B sahibine kredi (süresiz düzeltme)');
select tap.eq($$select bucket || ':' || coalesce(expires_at::text, 'süresiz') from public.credit_ledger where idempotency_key = 'grant-b1'$$,
  'purchased:süresiz', 'adjust: varsayılan kova purchased, süre verilmezse süresiz');

select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a1'), true);
set local role authenticated;
select tap.eq($$select count(*)::text from public.credit_accounts$$, '1', 'A sahibi yalnız kendi hesabını görür');
select tap.eq($$select count(distinct account_id)::text from public.credit_ledger$$, '1', 'A sahibi yalnız kendi hareketlerini görür');
select tap.eq($$select (count(*) > 0)::text from public.credit_holds$$, 'true', 'A sahibi kendi ayırmalarını görür');
select tap.eq($$select coalesce(sum(free) filter (where expires_at is null or expires_at > now()), 0)::text from public.credit_lots$$, '40',
  'A sahibi bakiyesini partilerden okur (görünüm çağıranın RLS''iyle çalışır)');
select tap.throws('42501', $$select public.grant_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 'adjust', 1000, 'self-grant')$$, 'üye kendine kredi veremez');
select tap.throws('42501', $$select public.reserve_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 1, 'self-reserve')$$, 'üye RPC ile ayıramaz');
select tap.throws('42501', $$select public.settle_credits('job-1', 0)$$, 'üye kesinleştiremez');
select tap.throws('42501', $$select public.release_credits('job-1')$$, 'üye bırakamaz');
select tap.throws('42501', $$insert into public.credit_ledger (account_id, entry_type, amount, bucket, idempotency_key)
    select id, 'adjust', 1000, 'purchased', 'self-insert' from public.credit_accounts$$, 'üye deftere yazamaz');
select tap.throws('42501', $$delete from public.credit_holds$$, 'üye ayırma silemez');
reset role;

-- A'nın izleyici üyesi (…a3) A sahibinin kredisini GÖRMEZ: kredi çalışma alanına değil kullanıcıya aittir.
select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a3'), true);
set local role authenticated;
select tap.eq($$select (select count(*) from public.credit_accounts)::text || ':' || (select count(*) from public.credit_ledger)::text || ':' ||
                       (select count(*) from public.credit_holds)::text || ':' || (select count(*) from public.credit_lots)::text$$,
  '0:0:0:0', 'aynı çalışma alanının başka üyesi sahibin kredisini görmez');
reset role;

select set_config('request.jwt.claims', tap.claims('bbbbbbbb-0000-4000-8000-0000000000b1'), true);
set local role authenticated;
select tap.eq($$select count(*)::text || ':' || sum(amount)::text from public.credit_ledger$$, '1:7', 'B sahibi yalnız kendi tek hareketini görür');
select tap.eq($$select count(*)::text from public.credit_hold_allocations$$, '0', 'B sahibi A''nın dağılımlarını görmez');
reset role;

set local role anon;
select tap.throws('42501', $$select count(*) from public.credit_ledger$$, 'anon defteri okuyamaz');
select tap.throws('42501', $$select public.grant_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 'adjust', 1, 'anon-grant')$$, 'anon kredi veremez');
reset role;

-- ── Koşu satırı: model + iş bağı ───────────────────────────────────────────────
set local role service_role;
select tap.eq($$select (r).model || ':' || (r).panel_job_id from (select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'claude_cli', 0,
    '{"kind": "llm_ideas", "billing": "subscription", "model": "claude-haiku-5-5", "panel_job_id": "aaaaaaaa-0000-4000-8000-0000000000b7"}') as r) s$$,
  'claude-haiku-5-5:aaaaaaaa-0000-4000-8000-0000000000b7', 'reserve_budget koşuya modeli ve işi yazar');
select tap.eq($$select coalesce((r).model, 'NULL') || ':' || coalesce((r).panel_job_id::text, 'NULL') from (select public.reserve_budget(
    'aaaaaaaa-0000-4000-8000-000000000001', 'claude_cli', 0, '{"kind": "llm_ideas", "billing": "subscription"}') as r) s$$,
  'NULL:NULL', 'model / iş verilmezse NULL kalır (eski çağıranlar değişmedi)');
reset role;

-- ── 0019: service role'e karşı sağlamlaştırma ──────────────────────────────────
select tap.eq($$select string_agg(pg_typeof(v)::text, ',') from (select unnest(array[remaining, held, free]) as v from public.credit_lots limit 3) s$$,
  'bigint,bigint,bigint', 'parti toplamları bigint (çok partili hesapta taşmaz)');
set local role service_role;
select tap.throws('42501', $$delete from public.credit_accounts$$, 'service role hesap silemez (defterin tamamı giderdi)');
select tap.throws('42501', $$select public.delete_test_credit_account('aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'test işareti olmayan kullanıcının hesabı test yoluyla da silinemez', 'credit_account_not_test');
select tap.eq($$select coalesce((r).panel_job_id::text, 'NULL') from (select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'claude_cli', 0,
    '{"kind": "llm_ideas", "billing": "subscription", "panel_job_id": "  "}') as r) s$$, 'NULL', 'reserve_budget: boş metinli iş kimliği NULL sayılır');
-- Kesinleşen = düşülen: doğrudan durum yazımı ve elle düşüm satırı commit edilemez (ertelenmiş denetim burada hemen çalıştırılır).
select tap.affects(1, $$select public.reserve_credits('aaaaaaaa-0000-4000-8000-0000000000a1', 3, 'job-h1')$$, 'açık ayırma (sağlamlaştırma testi)');
select tap.throws('23514', $$update public.credit_holds set status = 'settled', charged = 3, closed_at = now() where idempotency_key = 'job-h1';
    set constraints all immediate$$, 'düşüm satırı olmadan kesinleşmiş sayılamaz', 'credit_hold_charge_mismatch');
select tap.throws('23514', $$insert into public.credit_ledger (account_id, entry_type, amount, bucket, lot_id, hold_id, idempotency_key)
    select h.account_id, 'charge', -1, l.bucket, a.lot_id, h.id, 'direct-charge-open'
      from public.credit_holds h join public.credit_hold_allocations a on a.hold_id = h.id join public.credit_ledger l on l.id = a.lot_id
     where h.idempotency_key = 'job-h1' limit 1;
    set constraints all immediate$$, 'açık ayırmaya elle düşüm satırı yazılamaz', 'credit_hold_charge_mismatch');
select tap.throws('23514', $$insert into public.credit_ledger (account_id, entry_type, amount, bucket, lot_id, hold_id, idempotency_key)
    select h.account_id, 'charge', -1, l.bucket, l.id, h.id, 'direct-charge-settled'
      from public.credit_holds h join public.credit_ledger l on l.account_id = h.account_id and l.idempotency_key = 'grant-p1'
     where h.idempotency_key = 'job-b7';
    set constraints all immediate$$, 'kesinleşmiş ayırmaya ek düşüm yazılamaz (toplam ≠ kesinleşen)', 'credit_hold_charge_mismatch');
select tap.throws('23503', $$insert into public.credit_ledger (account_id, entry_type, amount, bucket, lot_id, hold_id, idempotency_key)
    select l.account_id, 'charge', -1, l.bucket, l.id, (select id from public.credit_holds where idempotency_key = 'job-h1'), 'cross-account-charge'
      from public.credit_ledger l where l.idempotency_key = 'grant-b1'$$, 'düşüm başka hesabın ayırmasına işaret edemez', 'credit_ledger_hold_account_fkey');
select tap.eq($$select (public.settle_credits('job-h1', 2)).charged::text$$, '2', 'RPC ile kesinleştirme denetimden geçer');
set constraints all immediate;
set constraints all deferred;
select tap.eq($$select tap.credit_available('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '38', 'bakiye 40 − 2 = 38');
reset role;
select tap.throws('23514', $$truncate public.credit_hold_allocations$$, 'dağılım TRUNCATE ile boşaltılamaz (tablo sahibi dahil)', 'credit_ledger_immutable');
select tap.throws('23514', $$truncate public.credit_holds cascade$$, 'ayırmalar TRUNCATE ile boşaltılamaz', 'credit_ledger_immutable');
-- Test kullanıcısı (iki işaret birlikte): hesabı dar yoldan silinir.
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"credit_test": true}' where id = 'bbbbbbbb-0000-4000-8000-0000000000b1';
set local role service_role;
select tap.eq($$select public.delete_test_credit_account('bbbbbbbb-0000-4000-8000-0000000000b1')::text$$, 'true', 'test kullanıcısının hesabı dar yoldan silinir');
select tap.eq($$select public.delete_test_credit_account('bbbbbbbb-0000-4000-8000-0000000000b1')::text$$, 'false', 'hesap yoksa false (hata değil)');
select tap.affects(1, $$select public.grant_credits('bbbbbbbb-0000-4000-8000-0000000000b1', 'adjust', 7, 'grant-b1-again')$$, 'B sahibine yeniden kredi');
reset role;

-- ── Bağ kopması + hesabın silinmesi (tek güncelleme / silme yolu) ──────────────
delete from public.panel_jobs where id = 'aaaaaaaa-0000-4000-8000-0000000000b7';
select tap.eq($$select count(*)::text || ':' || count(panel_job_id)::text || ':' || sum(amount)::text from public.credit_ledger
                 where hold_id = (select id from public.credit_holds where idempotency_key = 'job-b7')$$,
  '1:0:-5', 'iş silinince düşüm satırı kalır, yalnız bağ kopar (tutar değişmez)');
select tap.eq($$select tap.credit_available('aaaaaaaa-0000-4000-8000-0000000000a1')$$, '38', 'bağ kopması bakiyeyi değiştirmez');
select tap.throws('23503', $$delete from auth.users where id = 'bbbbbbbb-0000-4000-8000-0000000000b1'$$, 'hesabı duran kullanıcı silinemez (denetim izi)');
select tap.affects(1, $$delete from public.credit_accounts where owner_user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$, 'hesabın tamamı silinebilir');
select tap.eq($$select (select count(*) from public.credit_ledger)::text || ':' || (select count(*) from public.credit_holds)::text || ':' ||
                       (select count(*) from public.credit_hold_allocations)::text$$,
  '1:0:0', 'hesapla birlikte defteri, ayırmaları ve dağılımları gider (yalnız B''nin satırı kalır)');
