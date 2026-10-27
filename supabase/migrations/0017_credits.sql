-- panel — 0017: kredi defteri (`credit_accounts`, `credit_ledger`, `credit_holds`, `credit_hold_allocations`) + koşu satırına
-- model / iş bağı (`collection_runs.model`, `collection_runs.panel_job_id`). Plan: docs/KREDI-PLAN.md §4, §6 (Dilim 2).
-- Şema ↔ domain eşlemesi: src/lib/domain/credits.ts; saf hesap (mock ile ortak): src/lib/credits/compute.ts.
-- YALNIZ EKLEMELİ: yeni tablolar + yeni fonksiyonlar + `collection_runs`'a iki NULL sütun; mevcut satırlara dokunmaz, sütun düşürmez.
-- `reserve_budget` AYNI imzayla yeniden tanımlanır (0007 / 0010 deseni): tek fark p_run.model ve p_run.panel_job_id'nin satıra yazılması.
-- Uygulama: `npx -y supabase@2.118.0 migration up --local`.
--
-- İŞ AKIŞINA BAĞLI DEĞİLDİR (Dilim 3): hiçbir iş kendiliğinden kredi ayırmaz / düşmez; bu dosya yalnız defteri ve kurallarını kurar.
--
-- ── Tasarım ────────────────────────────────────────────────
-- 1) BAKİYE SAKLANMAZ, TÜRETİLİR. Defterde iki tür satır vardır:
--      · PARTİ açan satır (`lot_id` NULL, tutar > 0): `grant_monthly`, `purchase`, artı yönlü `adjust`. Kova ve son kullanma tarihi partidedir.
--      · Partiye işleyen satır (`lot_id` dolu): `charge` / `expire` / eksi yönlü `adjust` (tutar < 0), `refund` (tutar > 0).
--    Bir partinin kalanı = parti tutarı + ona işleyen satırların toplamı. Kullanılabilir = Σ (süresi DOLMAMIŞ partilerin kalanı) − Σ açık
--    ayırma. Süre dolumu ZAMANLA kendiliğinden işler: `expires_at <= now()` olan partinin kalanı sayılmaz, bunun için `expire` satırı ya da
--    zamanlanmış iş gerekmez (ileride yazılacak `expire` satırı yalnız muhasebe kaydıdır: partinin kalanını 0'a indirir).
-- 2) NEDEN PARTİ: iki kova (aylık dönem sonunda yanar, ek kredi 12 ay) ve aynı kovada birden çok parti (iki ek satın alma) vardır. Hangi
--    düşümün hangi partiden yapıldığı bilinmezse süresi dolan partiden geriye ne kaldığı hesaplanamaz ("dolan kredi harcanamaz" kuralı
--    tutmaz). Bu yüzden her düşüm satırı partisini gösterir; kesinleştirme tutarı partilere böler (ayırma başına parti başına bir satır).
-- 3) AYIRMA PARTİYE BAĞLANIR (`credit_hold_allocations`): `reserve_credits` krediyi harcama sırasıyla (önce aylık kova, kova içinde süresi
--    en yakın dolan) partilerden ayırır ve kaydeder. Böylece (a) partinin serbest kalanı hiçbir zaman eksiye düşmez (ayırmalar + düşümler ≤
--    parti), (b) kesinleştirme yalnız kendi ayırdığından düşer, başka iş onu tüketemez, (c) ayırma anında geçerli olan kredi, iş bitene
--    kadar o işe aittir: parti ayırmadan SONRA dolsa bile ayrılmış kısım düşülebilir (iş saatlerle sınırlıdır; yarıda "kredin yandı" denmez).
-- 4) EKSİ BAKİYE İMKÂNSIZ: hesap başına advisory kilit (`reserve_budget` deseni) + koruma trigger'ları. Kural hangi yoldan yazılırsa
--    yazılsın geçerlidir: deftere eksi satır ya da ayırma dağılımı yazılırken partinin serbest kalanı eksiye düşecekse satır reddedilir.
-- 5) DEFTER DEĞİŞMEZ: güncelleme ve silme trigger'la kapalıdır (her rol için). İki dar istisna: bağlı kayıt silinince FK'nin bağı
--    koparması (`workspace_id` / `panel_job_id` / `run_id` → NULL; tutar ve tür değişmez) ve hesabın TAMAMININ silinmesi (cascade).
-- 6) İDEMPOTENT: her RPC bir anahtar alır (iş için iş kimliği, sohbette koşu kimliği; verme için ödeme / dönem anahtarı). Aynı anahtarla
--    ikinci çağrı ilk sonucu döndürür, ikinci kez düşmez / vermez. Aynı anahtar FARKLI tutarla gelirse hata (`credit_idempotency_conflict`).
-- 7) SAHİPLİK: kredi KULLANICIYA aittir (`credit_accounts.owner_user_id` benzersiz); tüm çalışma alanları tek bakiyeden yer, defter satırı
--    hangi çalışma alanı için harcandığını taşır. Hesap ilk `grant_credits` çağrısında açılır (hesabı olmayan kullanıcının bakiyesi 0'dır).
-- Yeni hareket türü / kova / ayırma durumu = bu CHECK listeleri + src/lib/domain/credits.ts BİRLİKTE genişler.

-- ── Koşu satırı: model + iş bağı ───────────────────────────
-- `model`: çağrının gerçek modeli (Claude CLI / agy zarfından). Gölge maliyet (`domain/provider-pricing.ts`) doluysa bunu kullanır, boşsa
-- sağlayıcı varsayımına düşer. `panel_job_id`: koşuyu açan panel işi (iş başına "alınan kredi ↔ gerçek USD" raporu; Dilim 3 / 7 yazar).
alter table public.collection_runs
  add column model text check (model is null or char_length(btrim(model)) between 1 and 120),
  add column panel_job_id uuid references public.panel_jobs (id) on delete set null;
comment on column public.collection_runs.model is 'Çağrının modeli (zarfın bildirdiği ad). NULL = kaydedilmedi (gölge maliyet sağlayıcı varsayımına düşer).';
comment on column public.collection_runs.panel_job_id is 'Koşuyu açan panel işi. NULL = işe bağlı değil (betik koşusu ya da eski satır).';
create index collection_runs_panel_job_idx on public.collection_runs (panel_job_id) where panel_job_id is not null;

-- 0010'daki reserve_budget ile AYNI imza ve tavan kuralları; tek fark p_run.model ve p_run.panel_job_id (ikisi de isteğe bağlı).
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
    v_billing, v_purpose, nullif(btrim(p_run ->> 'model'), ''), (p_run ->> 'panel_job_id')::uuid
  )
  returning * into v_run;

  return v_run;
end;
$$;
revoke all on function public.reserve_budget(uuid, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_budget(uuid, text, numeric, jsonb) to service_role;

-- ── Tablolar ───────────────────────────────────────────────
create table public.credit_accounts (
  id uuid primary key default gen_random_uuid(),
  -- Bakiye sahibi. Denetim izi için kullanıcı, hesabı dururken silinemez (RESTRICT): önce hesap silinir.
  owner_user_id uuid not null unique references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);
comment on table public.credit_accounts is 'Kredi hesabı: kullanıcı başına tek. Bakiye SAKLANMAZ; credit_ledger + credit_holds''tan türetilir.';

create table public.credit_holds (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.credit_accounts (id) on delete cascade,
  -- Hangi çalışma alanı / iş / koşu için ayrıldı (bağlı kayıt silinirse bağ kopar, ayırma kalır).
  workspace_id uuid references public.workspaces (id) on delete set null,
  panel_job_id uuid references public.panel_jobs (id) on delete set null,
  run_id uuid references public.collection_runs (id) on delete set null,
  -- Ayrılan EN ÇOK tutar (kredi).
  amount integer not null check (amount > 0),
  status text not null default 'open' check (status in ('open', 'settled', 'released')),
  -- Kesinleşen (düşülen) tutar. NULL = kesinleşmedi (0 değil); 0 = kesinleşti, hiç düşülmedi.
  charged integer check (charged >= 0),
  -- Düşülen birim sayıları ({ kalem: adet }; zod: creditUnitsSchema) ve fiyat tablosu sürümü: kesinleşirken yazılır.
  units jsonb check (units is null or jsonb_typeof(units) = 'object'),
  price_version text check (price_version is null or char_length(btrim(price_version)) between 1 and 40),
  -- İdempotency anahtarı: iş için iş kimliği, sohbette koşu kimliği. Aynı anahtarla ikinci ayırma aynı satırı döndürür.
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9._:-]{1,120}$'),
  created_at timestamptz not null default now(),
  closed_at timestamptz,

  constraint credit_holds_account_key unique (id, account_id),
  constraint credit_holds_open_shape check ((status = 'open') = (closed_at is null)),
  constraint credit_holds_settled_shape check ((status = 'settled') = (charged is not null)),
  constraint credit_holds_charged_within check (charged is null or charged <= amount)
);
comment on table public.credit_holds is 'Kredi ayırmaları: iş başlamadan en çok tutar ayrılır; bitince kesinleşir (settled), iptal / hatada bırakılır (released).';
comment on column public.credit_holds.charged is 'Kesinleşen tutar. NULL = kesinleşmedi (0 değil).';
-- İş başına tek AÇIK ayırma.
create unique index credit_holds_one_open_per_job on public.credit_holds (panel_job_id) where status = 'open' and panel_job_id is not null;
create index credit_holds_account_open_idx on public.credit_holds (account_id) where status = 'open';
create index credit_holds_workspace_idx on public.credit_holds (workspace_id) where workspace_id is not null;
create index credit_holds_run_idx on public.credit_holds (run_id) where run_id is not null;
alter table public.credit_holds enable row level security;

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.credit_accounts (id) on delete cascade,
  entry_type text not null check (entry_type in ('grant_monthly', 'purchase', 'charge', 'refund', 'expire', 'adjust')),
  -- İşaretli tam sayı: artı = kredi girer, eksi = kredi çıkar.
  amount integer not null check (amount <> 0),
  bucket text not null check (bucket in ('monthly', 'purchased')),
  -- NULL = bu satır bir PARTİ açar; dolu = bu satır o partiye işler (aynı hesap + aynı kova: bileşik FK).
  lot_id uuid,
  -- Yalnız parti satırında: partinin son kullanma anı. NULL = süresiz.
  expires_at timestamptz,
  workspace_id uuid references public.workspaces (id) on delete set null,
  panel_job_id uuid references public.panel_jobs (id) on delete set null,
  run_id uuid references public.collection_runs (id) on delete set null,
  -- Düşümü doğuran ayırma. Aynı ayırmanın satırları AYNI `units`'i taşır (rapor `hold_id` ile tekilleştirir).
  hold_id uuid references public.credit_holds (id),
  units jsonb check (units is null or jsonb_typeof(units) = 'object'),
  price_version text check (price_version is null or char_length(btrim(price_version)) between 1 and 40),
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9._:-]{1,200}$'),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),

  constraint credit_ledger_account_key unique (id, account_id),
  constraint credit_ledger_lot_key unique (id, account_id, bucket),
  constraint credit_ledger_lot_fkey foreign key (lot_id, account_id, bucket) references public.credit_ledger (id, account_id, bucket),
  -- Tür ↔ yön ↔ parti tutarlılığı.
  constraint credit_ledger_shape check (
    case entry_type
      when 'grant_monthly' then amount > 0 and lot_id is null and bucket = 'monthly' and expires_at is not null
      when 'purchase' then amount > 0 and lot_id is null and bucket = 'purchased' and expires_at is not null
      when 'charge' then amount < 0 and lot_id is not null
      when 'expire' then amount < 0 and lot_id is not null
      when 'refund' then amount > 0 and lot_id is not null
      when 'adjust' then (amount > 0 and lot_id is null) or (amount < 0 and lot_id is not null)
    end
  ),
  constraint credit_ledger_expiry_on_lot check (lot_id is null or expires_at is null),
  constraint credit_ledger_charge_has_hold check (entry_type <> 'charge' or hold_id is not null)
);
comment on table public.credit_ledger is 'Kredi defteri: YALNIZ EKLENİR (güncelleme / silme trigger''la kapalı). Bakiye buradan türetilir.';
comment on column public.credit_ledger.lot_id is 'NULL = parti açan satır (kova + son kullanma burada); dolu = o partiye işleyen satır.';
create index credit_ledger_account_created_idx on public.credit_ledger (account_id, created_at desc, id desc);
create index credit_ledger_lot_idx on public.credit_ledger (lot_id) where lot_id is not null;
create index credit_ledger_workspace_idx on public.credit_ledger (workspace_id, created_at desc) where workspace_id is not null;
create index credit_ledger_job_idx on public.credit_ledger (panel_job_id) where panel_job_id is not null;
create index credit_ledger_run_idx on public.credit_ledger (run_id) where run_id is not null;
create index credit_ledger_hold_idx on public.credit_ledger (hold_id) where hold_id is not null;
alter table public.credit_ledger enable row level security;
alter table public.credit_accounts enable row level security;

-- Ayırmanın partilere dağılımı (ayırma başına parti başına tek satır). Yalnız eklenir.
create table public.credit_hold_allocations (
  hold_id uuid not null,
  account_id uuid not null,
  lot_id uuid not null,
  amount integer not null check (amount > 0),
  primary key (hold_id, lot_id),
  constraint credit_hold_allocations_hold_fkey foreign key (hold_id, account_id) references public.credit_holds (id, account_id) on delete cascade,
  constraint credit_hold_allocations_lot_fkey foreign key (lot_id, account_id) references public.credit_ledger (id, account_id) on delete cascade
);
comment on table public.credit_hold_allocations is 'Ayırmanın hangi partiden ne kadar tuttuğu. Açık ayırmanın dağılımı partinin serbest kalanından düşer.';
create index credit_hold_allocations_lot_idx on public.credit_hold_allocations (lot_id);
alter table public.credit_hold_allocations enable row level security;

-- ── Türetilmiş görünüm: partiler ───────────────────────────
-- remaining = defterdeki net (parti + işleyen satırlar) · held = açık ayırmaların bu partiden tuttuğu · free = harcanabilir kalan.
-- Süre süzgeci YOKTUR (çağıran `expires_at` ile süzer): süresi dolmuş partinin açık ayırması da görünür kalsın.
-- security_invoker: çağıranın RLS'i uygulanır (üye yalnız kendi hesabının partilerini görür).
create view public.credit_lots with (security_invoker = true) as
select l.id as lot_id,
       l.account_id,
       l.bucket,
       l.entry_type,
       l.amount as granted,
       l.expires_at,
       l.created_at,
       (l.amount + coalesce(u.delta, 0))::integer as remaining,
       coalesce(h.held, 0)::integer as held,
       (l.amount + coalesce(u.delta, 0) - coalesce(h.held, 0))::integer as free
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

-- ── Kilit + yardımcılar ────────────────────────────────────
-- Hesap başına advisory kilit (transaction sonunda bırakılır; aynı transaction'da yeniden alınabilir).
create function private.credit_lock(p_account uuid)
returns void
language sql
set search_path = ''
as $$ select pg_advisory_xact_lock(hashtextextended('credits:' || p_account::text, 0)) $$;
revoke all on function private.credit_lock(uuid) from public, anon, authenticated;
grant execute on function private.credit_lock(uuid) to service_role;

-- Hesabın şu an harcanabilir kredisi: süresi dolmamış partilerin serbest kalanı (açık ayırmalar düşülmüş).
create function private.credit_available(p_account uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(l.free), 0)::integer
    from public.credit_lots l
   where l.account_id = p_account
     and l.free > 0
     and (l.expires_at is null or l.expires_at > now())
$$;
revoke all on function private.credit_available(uuid) from public, anon, authenticated;
grant execute on function private.credit_available(uuid) to service_role;

-- ── Koruma: defter ─────────────────────────────────────────
-- Her rol için geçerlidir (service role dahil). Hata kodu 23514, ileti `credit_*` (depo `invalid_state`'e çevirir).
create function private.credit_ledger_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lot public.credit_ledger;
  v_free integer;
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
revoke all on function private.credit_ledger_guard() from public, anon, authenticated;
create trigger credit_ledger_guard before insert or update or delete on public.credit_ledger
  for each row execute function private.credit_ledger_guard();

-- ── Koruma: ayırma ─────────────────────────────────────────
-- Kimlik ve tutar değişmez; durum yalnız open → settled | released; kapanmış ayırma donar (FK'nin bağ koparması hariç).
create function private.credit_holds_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_links text[] := array['workspace_id', 'panel_job_id', 'run_id'];
begin
  if new.account_id is distinct from old.account_id
     or new.amount is distinct from old.amount
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at is distinct from old.created_at
     or (new.workspace_id is not null and new.workspace_id is distinct from old.workspace_id)
     or (new.panel_job_id is not null and new.panel_job_id is distinct from old.panel_job_id)
     or (new.run_id is not null and new.run_id is distinct from old.run_id) then
    raise exception 'credit_hold_immutable' using errcode = '23514', detail = 'Ayırmanın hesabı, tutarı, anahtarı ve bağları sonradan değişmez.';
  end if;
  if old.status <> 'open' and (to_jsonb(new) - v_links) is distinct from (to_jsonb(old) - v_links) then
    raise exception 'credit_hold_closed' using errcode = '23514', detail = format('%s durumundaki ayırma değiştirilemez.', old.status);
  end if;
  return new;
end;
$$;
revoke all on function private.credit_holds_guard() from public, anon, authenticated;
create trigger credit_holds_guard before update on public.credit_holds
  for each row execute function private.credit_holds_guard();

-- Dağılım satırı: yalnız AÇIK ayırmaya, yalnız süresi dolmamış bir partiden, partinin serbest kalanı ve ayırma tutarı içinde (kilit altında).
create function private.credit_hold_allocations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_hold public.credit_holds;
  v_lot public.credit_lots;
  v_allocated integer;
begin
  if tg_op = 'UPDATE' then
    raise exception 'credit_allocation_immutable' using errcode = '23514', detail = 'Ayırma dağılımı değiştirilemez.';
  end if;
  perform private.credit_lock(new.account_id);
  select h.* into v_hold from public.credit_holds h where h.id = new.hold_id;
  if v_hold.status is distinct from 'open' then
    raise exception 'credit_hold_closed' using errcode = '23514', detail = 'Yalnız açık ayırmaya dağılım yazılabilir.';
  end if;
  select l.* into v_lot from public.credit_lots l where l.lot_id = new.lot_id;
  if v_lot.lot_id is null then
    raise exception 'credit_lot_invalid' using errcode = '23514', detail = 'Dağılım yalnız parti açan bir satıra yazılabilir.';
  end if;
  if v_lot.expires_at is not null and v_lot.expires_at <= now() then
    raise exception 'credit_lot_expired' using errcode = '23514', detail = format('lot=%s', new.lot_id);
  end if;
  if v_lot.free - new.amount < 0 then
    raise exception 'credit_negative_balance' using errcode = '23514',
      detail = format('lot=%s free=%s amount=%s', new.lot_id, v_lot.free, new.amount);
  end if;
  select coalesce(sum(a.amount), 0)::integer into v_allocated from public.credit_hold_allocations a where a.hold_id = new.hold_id;
  if v_allocated + new.amount > v_hold.amount then
    raise exception 'credit_allocation_exceeds_hold' using errcode = '23514',
      detail = format('hold=%s amount=%s allocated=%s', new.hold_id, v_hold.amount, v_allocated + new.amount);
  end if;
  return new;
end;
$$;
revoke all on function private.credit_hold_allocations_guard() from public, anon, authenticated;
create trigger credit_hold_allocations_guard before insert or update on public.credit_hold_allocations
  for each row execute function private.credit_hold_allocations_guard();

-- ── Kredi ver ──────────────────────────────────────────────
-- Yeni parti açar. p_type: grant_monthly (kova `monthly`; p_expires_at ZORUNLU = dönem sonu) · purchase (kova `purchased`; verilmezse 12 ay) ·
-- adjust (elle düzeltme / başlangıç bakiyesi; kova p_bucket, verilmezse `purchased`; p_expires_at NULL = süresiz). Hesap yoksa açılır.
-- İdempotent: aynı anahtarla ikinci çağrı ilk satırı döndürür (ikinci kez vermez); anahtar başka hesap / tür / tutarla gelirse hata.
-- Geçmiş tarihli `p_expires_at` reddedilmez: o parti doğduğu anda harcanamaz (bakiye değişmez). Kullanıcı yoksa 23503.
create function public.grant_credits(
  p_owner uuid,
  p_type text,
  p_amount integer,
  p_key text,
  p_bucket text default null,
  p_expires_at timestamptz default null,
  p_ws uuid default null,
  p_note text default null
)
returns public.credit_ledger
language plpgsql
set search_path = ''
as $$
declare
  v_key text := nullif(btrim(coalesce(p_key, '')), '');
  v_bucket text;
  v_expires timestamptz := p_expires_at;
  v_account uuid;
  v_row public.credit_ledger;
begin
  if p_owner is null or p_type is null or p_amount is null or v_key is null then
    raise exception 'credit_invalid_argument' using errcode = '22023';
  end if;
  if p_type not in ('grant_monthly', 'purchase', 'adjust') then
    raise exception 'credit_invalid_type' using errcode = '22023', detail = p_type;
  end if;
  if p_amount <= 0 then
    raise exception 'credit_invalid_amount' using errcode = '22023', detail = 'Verilen kredi pozitif olmalı.';
  end if;
  v_bucket := case p_type when 'grant_monthly' then 'monthly' when 'purchase' then 'purchased' else coalesce(nullif(btrim(coalesce(p_bucket, '')), ''), 'purchased') end;
  if p_bucket is not null and btrim(p_bucket) <> v_bucket then
    raise exception 'credit_invalid_bucket' using errcode = '22023', detail = format('%s türü %s kovasına yazılır.', p_type, v_bucket);
  end if;
  if p_type = 'grant_monthly' and v_expires is null then
    raise exception 'credit_expiry_required' using errcode = '22023', detail = 'Aylık kredi dönem sonu ister.';
  end if;
  if p_type = 'purchase' and v_expires is null then
    v_expires := now() + interval '12 months';
  end if;

  insert into public.credit_accounts (owner_user_id) values (p_owner) on conflict (owner_user_id) do nothing;
  select a.id into v_account from public.credit_accounts a where a.owner_user_id = p_owner;
  perform private.credit_lock(v_account);

  select l.* into v_row from public.credit_ledger l where l.idempotency_key = v_key;
  if found then
    if v_row.account_id <> v_account or v_row.entry_type <> p_type or v_row.amount <> p_amount then
      raise exception 'credit_idempotency_conflict' using errcode = '22023', detail = 'Aynı anahtar başka bir hareket için kullanılmış.';
    end if;
    return v_row;
  end if;

  insert into public.credit_ledger (account_id, entry_type, amount, bucket, expires_at, workspace_id, idempotency_key, note)
  values (v_account, p_type, p_amount, v_bucket, v_expires, p_ws, v_key, nullif(btrim(coalesce(p_note, '')), ''))
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.grant_credits(uuid, text, integer, text, text, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.grant_credits(uuid, text, integer, text, text, timestamptz, uuid, text) to service_role;

-- ── Kredi ayır ─────────────────────────────────────────────
-- İş başlamadan EN ÇOK tutarı ayırır ve partilere dağıtır (önce aylık kova; kova içinde süresi en yakın dolan, sonra en eski).
-- Yetmezse `insufficient_credits` (P0001; ayrıntı `available=… requested=…`) ve HİÇBİR satır yazılmaz. İş başına tek açık ayırma
-- (`credit_hold_active`, 23505). İdempotent: aynı anahtarla ikinci çağrı ilk ayırmayı (durumu ne olursa olsun) döndürür.
create function public.reserve_credits(
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
  v_available integer;
  v_left integer;
  v_take integer;
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
    insert into public.credit_hold_allocations (hold_id, account_id, lot_id, amount) values (v_hold.id, v_account, v_lot.lot_id, v_take);
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
revoke all on function public.reserve_credits(uuid, integer, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_credits(uuid, integer, text, uuid, uuid, uuid) to service_role;

-- ── Kesinleştir ────────────────────────────────────────────
-- Gerçekleşen tutarı (0 ≤ p_actual ≤ ayrılan) ayırmanın partilerinden HARCAMA SIRASIYLA düşer (parti başına bir `charge` satırı); fark
-- anında serbest kalır. İdempotent: kesinleşmiş ayırmada ikinci çağrı (tutar ne olursa olsun) ilk sonucu döndürür, ikinci kez düşmez.
-- Bırakılmış ayırma kesinleştirilemez (`credit_hold_released`, 23514). Ayırma yoksa `credit_hold_not_found` (P0002).
create function public.settle_credits(
  p_key text,
  p_actual integer,
  p_units jsonb default null,
  p_price_version text default null
)
returns public.credit_holds
language plpgsql
set search_path = ''
as $$
declare
  v_key text := nullif(btrim(coalesce(p_key, '')), '');
  v_hold public.credit_holds;
  v_left integer;
  v_take integer;
  v_alloc record;
begin
  if v_key is null or p_actual is null then
    raise exception 'credit_invalid_argument' using errcode = '22023';
  end if;
  select h.* into v_hold from public.credit_holds h where h.idempotency_key = v_key;
  if not found then
    raise exception 'credit_hold_not_found' using errcode = 'P0002';
  end if;
  perform private.credit_lock(v_hold.account_id);
  select h.* into v_hold from public.credit_holds h where h.id = v_hold.id for update;

  if v_hold.status = 'settled' then
    return v_hold;
  end if;
  if v_hold.status = 'released' then
    raise exception 'credit_hold_released' using errcode = '23514', detail = 'Bırakılmış ayırma kesinleştirilemez.';
  end if;
  if p_actual < 0 then
    raise exception 'credit_invalid_amount' using errcode = '22023', detail = 'Gerçekleşen tutar negatif olamaz.';
  end if;
  if p_actual > v_hold.amount then
    raise exception 'credit_settle_exceeds_hold' using errcode = '22023', detail = format('reserved=%s actual=%s', v_hold.amount, p_actual);
  end if;

  -- Önce ayırma kapanır (dağılımı artık "ayrılmış" sayılmaz), sonra düşüm satırları yazılır: koruma çift saymaz.
  update public.credit_holds h
     set status = 'settled', charged = p_actual, units = p_units, price_version = nullif(btrim(coalesce(p_price_version, '')), ''), closed_at = now()
   where h.id = v_hold.id
  returning h.* into v_hold;

  v_left := p_actual;
  for v_alloc in
    select a.lot_id, a.amount, l.bucket
      from public.credit_hold_allocations a
      join public.credit_ledger l on l.id = a.lot_id
     where a.hold_id = v_hold.id
     order by (l.bucket = 'monthly') desc, l.expires_at asc nulls last, l.created_at, l.id
  loop
    exit when v_left = 0;
    v_take := least(v_left, v_alloc.amount);
    insert into public.credit_ledger (
      account_id, entry_type, amount, bucket, lot_id, workspace_id, panel_job_id, run_id, hold_id, units, price_version, idempotency_key
    )
    values (
      v_hold.account_id, 'charge', -v_take, v_alloc.bucket, v_alloc.lot_id, v_hold.workspace_id, v_hold.panel_job_id, v_hold.run_id,
      v_hold.id, v_hold.units, v_hold.price_version, 'charge:' || v_hold.id::text || ':' || v_alloc.lot_id::text
    );
    v_left := v_left - v_take;
  end loop;
  if v_left > 0 then
    raise exception 'credit_allocation_short' using errcode = '23514', detail = format('hold=%s short=%s', v_hold.id, v_left);
  end if;
  return v_hold;
end;
$$;
revoke all on function public.settle_credits(text, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.settle_credits(text, integer, jsonb, text) to service_role;

-- ── Bırak ──────────────────────────────────────────────────
-- Açık ayırmayı düşmeden serbest bırakır (iptal, hata, işçi kaybı). İdempotent: bırakılmış ayırma aynen döner; KESİNLEŞMİŞ ayırma da
-- aynen döner (düşüm geri alınmaz: çağıran durumdan anlar). Ayırma yoksa `credit_hold_not_found` (P0002).
create function public.release_credits(p_key text)
returns public.credit_holds
language plpgsql
set search_path = ''
as $$
declare
  v_key text := nullif(btrim(coalesce(p_key, '')), '');
  v_hold public.credit_holds;
begin
  if v_key is null then
    raise exception 'credit_invalid_argument' using errcode = '22023';
  end if;
  select h.* into v_hold from public.credit_holds h where h.idempotency_key = v_key;
  if not found then
    raise exception 'credit_hold_not_found' using errcode = 'P0002';
  end if;
  perform private.credit_lock(v_hold.account_id);
  select h.* into v_hold from public.credit_holds h where h.id = v_hold.id for update;
  if v_hold.status = 'open' then
    update public.credit_holds h set status = 'released', closed_at = now() where h.id = v_hold.id returning h.* into v_hold;
  end if;
  return v_hold;
end;
$$;
revoke all on function public.release_credits(text) from public, anon, authenticated;
grant execute on function public.release_credits(text) to service_role;

-- ── Yetki + RLS ────────────────────────────────────────────
-- Yazan yalnız sunucu (service role), RPC'ler üzerinden. Deftere ve dağılıma service role'ün de UPDATE / DELETE yetkisi yoktur (trigger
-- ayrıca her rolü engeller); hesap silme yetkisi vardır (hesabın tamamı: test temizliği, ileride hesap kapatma). Üye YALNIZ kendi
-- hesabını, hareketlerini, ayırmalarını ve partilerini okur.
grant select, insert, delete on public.credit_accounts to service_role;
grant select, insert on public.credit_ledger to service_role;
grant select, insert, update on public.credit_holds to service_role;
grant select, insert on public.credit_hold_allocations to service_role;
grant select on public.credit_lots to service_role;
grant select on public.credit_accounts, public.credit_ledger, public.credit_holds, public.credit_hold_allocations, public.credit_lots to authenticated;

create policy "credit_accounts: sahibi okur" on public.credit_accounts
  for select to authenticated using (owner_user_id = (select auth.uid()));
create policy "credit_ledger: hesap sahibi okur" on public.credit_ledger
  for select to authenticated using (account_id in (select a.id from public.credit_accounts a where a.owner_user_id = (select auth.uid())));
create policy "credit_holds: hesap sahibi okur" on public.credit_holds
  for select to authenticated using (account_id in (select a.id from public.credit_accounts a where a.owner_user_id = (select auth.uid())));
create policy "credit_hold_allocations: hesap sahibi okur" on public.credit_hold_allocations
  for select to authenticated using (account_id in (select a.id from public.credit_accounts a where a.owner_user_id = (select auth.uid())));
