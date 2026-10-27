-- panel — 0019: kredi defterinin service role'e karşı da sağlamlaştırılması (kod incelemesi bulguları; 0017 / 0018 uygulandığı için
-- dosyaları değiştirilmedi). YALNIZ EKLEMELİ: yetki, trigger, kısıt, fonksiyon ve bir görünümün yeniden tanımı. Tablo satırlarına, sütunlara
-- dokunmaz; sütun düşürmez. Uygulama: `npx -y supabase@2.118.0 migration up --local`.
--
--   1) HESAP SİLME: service role'ün `credit_accounts` silme yetkisi kaldırılır (silme cascade ile defterin TAMAMINI götürüyordu). Test
--      temizliği için tek dar yol: `delete_test_credit_account` — yalnız `app_metadata.credit_test = true` işaretli VE `@test.local`
--      adresli (yani testin açtığı) kullanıcının hesabını siler; gerçek kullanıcının hesabında `credit_account_not_test` (42501).
--   2) KESİNLEŞEN = DÜŞÜLEN: `open → settled` geçişinde `charged`, o ayırmanın düşüm (`charge`) satırlarının toplamına eşit olmak
--      zorundadır; kesinleşmemiş ayırmanın düşüm satırı olamaz. Denetim transaction SONUNDA yapılır (ertelenmiş kısıt trigger'ı:
--      `settle_credits` önce ayırmayı kapatır, sonra satırları yazar). Doğrudan `update credit_holds set status = 'settled'` ya da elle
--      eklenen `charge` satırı artık commit edilemez.
--   3) Düşüm satırının ayırması AYNI hesaba aittir (bileşik FK): başka hesabın ayırmasına işaret eden `charge` yazılamaz.
--   4) Ayırma ve dağılım TRUNCATE ile de boşaltılamaz (her rol; 0018 yalnız defteri kapatmıştı).
--   5) `credit_lots` toplamları `bigint` (çok partili hesapta `sum(...)::integer` taşma hatası veriyordu); onu okuyan fonksiyonlar da.
--   6) `reserve_budget`: `p_run.panel_job_id` boş metinse NULL sayılır (`''::uuid` hatası yerine); imza ve tavan kuralları AYNI.

-- ── 5) Görünüm: toplamlar bigint ───────────────────────────
-- Sütun tipi değiştiği için görünüm düşürülüp yeniden kurulur (türetilmiş nesne; veri taşımaz). Yetkiler yeniden verilir.
drop view public.credit_lots;
create view public.credit_lots with (security_invoker = true) as
select l.id as lot_id,
       l.account_id,
       l.bucket,
       l.entry_type,
       l.amount as granted,
       l.expires_at,
       l.created_at,
       (l.amount + coalesce(u.delta, 0))::bigint as remaining,
       coalesce(h.held, 0)::bigint as held,
       (l.amount + coalesce(u.delta, 0) - coalesce(h.held, 0))::bigint as free
  from public.credit_ledger l
  left join lateral (
    select sum(c.amount) as delta from public.credit_ledger c where c.lot_id = l.id
  ) u on true
  left join lateral (
    select sum(a.amount) as held
      from public.credit_hold_allocations a
      join public.credit_holds o on o.id = a.hold_id
     where a.lot_id = l.id and o.status = 'open'
  ) h on true
 where l.lot_id is null;
comment on view public.credit_lots is 'Kredi partileri: verilen, kalan, ayrılan, serbest. Kullanılabilir bakiye = süresi dolmamış partilerin free toplamı.';
revoke all on public.credit_lots from public, anon, authenticated, service_role;
grant select on public.credit_lots to service_role, authenticated;

-- Dönüş tipi değiştiği için fonksiyon düşürülüp yeniden kurulur (tek çağıranı `reserve_credits`, aşağıda yeniden tanımlanır).
drop function private.credit_available(uuid);
create function private.credit_available(p_account uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(l.free), 0)::bigint
    from public.credit_lots l
   where l.account_id = p_account
     and l.free > 0
     and (l.expires_at is null or l.expires_at > now())
$$;
revoke all on function private.credit_available(uuid) from public, anon, authenticated;
grant execute on function private.credit_available(uuid) to service_role;

-- 0017'deki defter korumasıyla AYNI kurallar; tek fark `v_free` artık bigint.
create or replace function private.credit_ledger_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lot public.credit_ledger;
  v_free bigint;
begin
  if tg_op = 'DELETE' then
    -- Tek silme yolu: hesabın TAMAMININ silinmesi (cascade). O anda hesap satırı artık yoktur.
    if exists (select 1 from public.credit_accounts a where a.id = old.account_id) then
      raise exception 'credit_ledger_immutable' using errcode = '23514', detail = 'Defter satırı silinemez.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- Tek güncelleme yolu: bağlı kayıt silinince FK'nin bağı koparması (yalnız NULL'a; başka hiçbir alan değişmez).
    if (to_jsonb(new) - array['workspace_id', 'panel_job_id', 'run_id']) is distinct from (to_jsonb(old) - array['workspace_id', 'panel_job_id', 'run_id'])
       or (new.workspace_id is not null and new.workspace_id is distinct from old.workspace_id)
       or (new.panel_job_id is not null and new.panel_job_id is distinct from old.panel_job_id)
       or (new.run_id is not null and new.run_id is distinct from old.run_id) then
      raise exception 'credit_ledger_immutable' using errcode = '23514', detail = 'Defter satırı değiştirilemez; düzeltme yeni satırla yapılır.';
    end if;
    return new;
  end if;

  -- INSERT: partiye işleyen satır partinin serbest kalanını eksiye düşüremez (kilit altında).
  if new.lot_id is not null then
    perform private.credit_lock(new.account_id);
    select l.* into v_lot from public.credit_ledger l where l.id = new.lot_id;
    if v_lot.lot_id is not null then
      raise exception 'credit_lot_invalid' using errcode = '23514', detail = 'Satır yalnız parti açan bir satıra işlenebilir.';
    end if;
    if new.amount < 0 then
      select l.free into v_free from public.credit_lots l where l.lot_id = new.lot_id;
      if coalesce(v_free, 0) + new.amount < 0 then
        raise exception 'credit_negative_balance' using errcode = '23514',
          detail = format('lot=%s free=%s amount=%s', new.lot_id, coalesce(v_free, 0), new.amount);
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- 0017'deki dağılım korumasıyla AYNI kurallar; tek fark toplamlar bigint (parti satırı görünümün satır tipi yerine alan alan okunur).
create or replace function private.credit_hold_allocations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_hold public.credit_holds;
  v_lot_id uuid;
  v_expires timestamptz;
  v_free bigint;
  v_allocated bigint;
begin
  if tg_op = 'UPDATE' then
    raise exception 'credit_allocation_immutable' using errcode = '23514', detail = 'Ayırma dağılımı değiştirilemez.';
  end if;
  perform private.credit_lock(new.account_id);
  select h.* into v_hold from public.credit_holds h where h.id = new.hold_id;
  if v_hold.status is distinct from 'open' then
    raise exception 'credit_hold_closed' using errcode = '23514', detail = 'Yalnız açık ayırmaya dağılım yazılabilir.';
  end if;
  select l.lot_id, l.expires_at, l.free into v_lot_id, v_expires, v_free from public.credit_lots l where l.lot_id = new.lot_id;
  if v_lot_id is null then
    raise exception 'credit_lot_invalid' using errcode = '23514', detail = 'Dağılım yalnız parti açan bir satıra yazılabilir.';
  end if;
  if v_expires is not null and v_expires <= now() then
    raise exception 'credit_lot_expired' using errcode = '23514', detail = format('lot=%s', new.lot_id);
  end if;
  if v_free - new.amount < 0 then
    raise exception 'credit_negative_balance' using errcode = '23514',
      detail = format('lot=%s free=%s amount=%s', new.lot_id, v_free, new.amount);
  end if;
  select coalesce(sum(a.amount), 0) into v_allocated from public.credit_hold_allocations a where a.hold_id = new.hold_id;
  if v_allocated + new.amount > v_hold.amount then
    raise exception 'credit_allocation_exceeds_hold' using errcode = '23514',
      detail = format('hold=%s amount=%s allocated=%s', new.hold_id, v_hold.amount, v_allocated + new.amount);
  end if;
  return new;
end;
$$;

-- 0017'deki `reserve_credits` ile AYNI imza ve kurallar; tek fark bakiye / kalan sayaçları bigint (ayrılan tutar integer'dır).
create or replace function public.reserve_credits(
  p_owner uuid,
  p_amount integer,
  p_key text,
  p_ws uuid default null,
  p_job uuid default null,
  p_run uuid default null
)
returns public.credit_holds
language plpgsql
set search_path = ''
as $$
declare
  v_key text := nullif(btrim(coalesce(p_key, '')), '');
  v_account uuid;
  v_hold public.credit_holds;
  v_available bigint;
  v_left bigint;
  v_take bigint;
  v_lot record;
begin
  if p_owner is null or p_amount is null or v_key is null then
    raise exception 'credit_invalid_argument' using errcode = '22023';
  end if;
  if p_amount <= 0 then
    raise exception 'credit_invalid_amount' using errcode = '22023', detail = 'Ayrılan kredi pozitif olmalı.';
  end if;

  select a.id into v_account from public.credit_accounts a where a.owner_user_id = p_owner;
  if not found then
    -- Hesabı olmayan kullanıcının bakiyesi 0'dır (aynı anahtarla daha önce ayırma da olamaz).
    raise exception 'insufficient_credits' using detail = format('available=%s requested=%s', 0, p_amount);
  end if;
  perform private.credit_lock(v_account);

  select h.* into v_hold from public.credit_holds h where h.idempotency_key = v_key;
  if found then
    if v_hold.account_id <> v_account or v_hold.amount <> p_amount then
      raise exception 'credit_idempotency_conflict' using errcode = '22023', detail = 'Aynı anahtar başka bir ayırma için kullanılmış.';
    end if;
    return v_hold;
  end if;

  if p_job is not null and exists (select 1 from public.credit_holds h where h.panel_job_id = p_job and h.status = 'open') then
    raise exception 'credit_hold_active' using errcode = '23505', detail = 'Bu iş için zaten açık bir ayırma var.';
  end if;

  v_available := private.credit_available(v_account);
  if v_available < p_amount then
    raise exception 'insufficient_credits' using detail = format('available=%s requested=%s', v_available, p_amount);
  end if;

  insert into public.credit_holds (account_id, workspace_id, panel_job_id, run_id, amount, idempotency_key)
  values (v_account, p_ws, p_job, p_run, p_amount, v_key)
  returning * into v_hold;

  v_left := p_amount;
  for v_lot in
    select l.lot_id, l.free
      from public.credit_lots l
     where l.account_id = v_account
       and l.free > 0
       and (l.expires_at is null or l.expires_at > now())
     order by (l.bucket = 'monthly') desc, l.expires_at asc nulls last, l.created_at, l.lot_id
  loop
    v_take := least(v_left, v_lot.free);
    insert into public.credit_hold_allocations (hold_id, account_id, lot_id, amount) values (v_hold.id, v_account, v_lot.lot_id, v_take::integer);
    v_left := v_left - v_take;
    exit when v_left = 0;
  end loop;
  if v_left > 0 then
    -- Kilit altında olamaz (yukarıda toplam yeterliydi); yine de yarım ayırma bırakılmaz.
    raise exception 'insufficient_credits' using detail = format('available=%s requested=%s', p_amount - v_left, p_amount);
  end if;
  return v_hold;
end;
$$;

-- ── 1) Hesap silme: service role'den alınır; test temizliğine dar yol ─────────
revoke delete on public.credit_accounts from service_role;

-- Yalnız TESTİN açtığı kullanıcının hesabını (defteri, ayırmaları, dağılımlarıyla) siler. İki işaret birlikte aranır: `app_metadata`
-- (yalnız service role yazabilir) `credit_test = true` ve `@test.local` adresi. Silinen hesap varsa true, hesap yoksa false.
-- SECURITY DEFINER: silme yetkisi çağıranda (service role) yoktur, fonksiyonun sahibindedir; kural fonksiyonun içindedir.
create function public.delete_test_credit_account(p_owner uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
begin
  if p_owner is null then
    raise exception 'credit_invalid_argument' using errcode = '22023';
  end if;
  if not exists (
    select 1
      from auth.users u
     where u.id = p_owner
       and coalesce(u.raw_app_meta_data ->> 'credit_test', '') = 'true'
       and u.email like '%@test.local'
  ) then
    raise exception 'credit_account_not_test' using errcode = '42501',
      detail = 'Yalnız test kullanıcısının (app_metadata.credit_test + @test.local) kredi hesabı silinebilir.';
  end if;
  delete from public.credit_accounts a where a.owner_user_id = p_owner returning a.id into v_account;
  return v_account is not null;
end;
$$;
revoke all on function public.delete_test_credit_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_test_credit_account(uuid) to service_role;

-- ── 2) Kesinleşen = düşülen (transaction sonunda) ──────────────────────────────
-- Ayırma güncellenince ve düşüm satırı eklenince çalışır; ertelenmiştir (commit'te): `settle_credits` önce ayırmayı kapatır, sonra
-- satırları yazar. Hesabın tamamı aynı transaction'da silindiyse ayırma yoktur: denetim atlanır.
create function private.credit_hold_charge_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_hold public.credit_holds;
  v_sum bigint;
begin
  if tg_table_name = 'credit_holds' then
    v_id := new.id;
  else
    v_id := new.hold_id;
  end if;
  if v_id is null then
    return null;
  end if;
  select h.* into v_hold from public.credit_holds h where h.id = v_id;
  if not found then
    return null;
  end if;
  select coalesce(-sum(l.amount), 0) into v_sum from public.credit_ledger l where l.hold_id = v_id and l.entry_type = 'charge';
  if v_hold.status = 'settled' then
    if v_sum <> v_hold.charged then
      raise exception 'credit_hold_charge_mismatch' using errcode = '23514',
        detail = format('hold=%s charged=%s ledger=%s: kesinleşen tutar düşüm satırlarının toplamına eşit olmalı.', v_id, v_hold.charged, v_sum);
    end if;
  elsif v_sum <> 0 then
    raise exception 'credit_hold_charge_mismatch' using errcode = '23514',
      detail = format('hold=%s status=%s ledger=%s: kesinleşmemiş ayırmanın düşüm satırı olamaz.', v_id, v_hold.status, v_sum);
  end if;
  return null;
end;
$$;
revoke all on function private.credit_hold_charge_check() from public, anon, authenticated;

create constraint trigger credit_holds_charge_check after update on public.credit_holds
  deferrable initially deferred
  for each row execute function private.credit_hold_charge_check();
create constraint trigger credit_ledger_charge_check after insert on public.credit_ledger
  deferrable initially deferred
  for each row when (new.entry_type = 'charge') execute function private.credit_hold_charge_check();

-- ── 3) Düşüm satırının ayırması aynı hesaptadır ────────────────────────────────
-- (`credit_holds_account_key (id, account_id)` 0017'de var.) `hold_id` NULL ise denetlenmez (verme / düzeltme satırları).
alter table public.credit_ledger
  add constraint credit_ledger_hold_account_fkey foreign key (hold_id, account_id) references public.credit_holds (id, account_id);

-- ── 4) Ayırma + dağılım TRUNCATE koruması (her rol) ────────────────────────────
create function private.credit_no_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'credit_ledger_immutable' using errcode = '23514', detail = format('%s boşaltılamaz.', tg_table_name);
end;
$$;
revoke all on function private.credit_no_truncate() from public, anon, authenticated;
create trigger credit_holds_no_truncate before truncate on public.credit_holds
  for each statement execute function private.credit_no_truncate();
create trigger credit_hold_allocations_no_truncate before truncate on public.credit_hold_allocations
  for each statement execute function private.credit_no_truncate();

-- ── 6) reserve_budget: boş metinli iş kimliği NULL sayılır ─────────────────────
-- 0017'deki tanımla AYNI imza, tavan kuralları ve gövde; tek fark `p_run.panel_job_id` için nullif(btrim(...), '').
create or replace function public.reserve_budget(
  p_ws uuid,
  p_provider text,
  p_amount numeric,
  p_run jsonb default '{}'::jsonb
)
returns public.collection_runs
language plpgsql
set search_path = ''
as $$
declare
  v_providers text[];
  v_cap numeric;
  v_tz text;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_committed numeric := 0;
  v_billing text;
  v_purpose text;
  v_run public.collection_runs;
begin
  if p_ws is null or p_provider is null or p_amount is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  if p_amount < 0 or p_amount = 'NaN'::numeric or p_amount = 'Infinity'::numeric then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_run is null or jsonb_typeof(p_run) <> 'object' then
    raise exception 'invalid_argument' using errcode = '22023', detail = 'p_run bir JSON nesnesi olmalı';
  end if;
  if nullif(btrim(p_run ->> 'kind'), '') is null then
    raise exception 'run_kind_required' using errcode = '22023';
  end if;
  v_billing := coalesce(nullif(btrim(p_run ->> 'billing'), ''), 'metered');
  if v_billing not in ('metered', 'subscription') then
    raise exception 'invalid_billing' using errcode = '22023', detail = v_billing;
  end if;
  v_purpose := nullif(btrim(p_run ->> 'purpose'), '');
  if v_purpose is not null and v_purpose <> 'measurement' then
    raise exception 'invalid_purpose' using errcode = '22023', detail = v_purpose;
  end if;

  if p_provider not in ('apify', 'anthropic', 'openai', 'deepgram', 'gemini', 'claude_cli', 'graph_api') then
    raise exception 'unknown_provider' using errcode = '22023', detail = p_provider;
  end if;
  -- Aynı tavanı paylaşan sağlayıcılar (NULL = tavansız: graph_api).
  v_providers := case
    when p_provider = 'apify' then array['apify']
    when p_provider <> 'graph_api' then array['anthropic', 'openai', 'deepgram', 'gemini', 'claude_cli']
  end;

  if v_providers is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('reserve_budget:' || p_ws::text || ':' || v_providers[1], 0)
    );
  end if;

  select w.timezone,
         case when p_provider = 'apify' then w.apify_monthly_cap_usd else w.llm_monthly_cap_usd end
    into v_tz, v_cap
    from public.workspaces w
   where w.id = p_ws;
  if not found then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  if v_providers is not null then
    v_month_start := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
    v_month_end := (date_trunc('month', now() at time zone v_tz) + interval '1 month') at time zone v_tz;

    select coalesce(sum(greatest(coalesce(r.actual_usd, 0), r.reserved_usd)), 0)
      into v_committed
      from public.collection_runs r
     where r.workspace_id = p_ws
       and r.provider = any (v_providers)
       and r.started_at >= v_month_start
       and r.started_at < v_month_end;

    if p_amount > 0 and v_committed + p_amount > v_cap then
      raise exception 'budget_exceeded'
        using detail = format('cap=%s committed=%s requested=%s', v_cap, v_committed, p_amount),
              hint = 'Aylık tavanı Ayarlar ekranından artır ya da ay başını bekle.';
    end if;
  end if;

  insert into public.collection_runs (
    workspace_id, provider, kind, status, target_label, external_run_id, dataset_id,
    reserved_usd, price_unknown, expected_results, billing, purpose, model, panel_job_id
  )
  values (
    p_ws, p_provider, btrim(p_run ->> 'kind'), 'reserved', p_run ->> 'target_label',
    p_run ->> 'external_run_id', p_run ->> 'dataset_id',
    p_amount, coalesce((p_run ->> 'price_unknown')::boolean, false), (p_run ->> 'expected_results')::integer,
    v_billing, v_purpose, nullif(btrim(p_run ->> 'model'), ''), nullif(btrim(p_run ->> 'panel_job_id'), '')::uuid
  )
  returning * into v_run;

  return v_run;
end;
$$;
