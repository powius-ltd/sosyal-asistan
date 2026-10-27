-- panel — Faz 2 zeka katmanı v2: abonelik faturalama, video analizi alanları, ses profili, haftalık plan.
-- Şema ↔ domain eşlemesi: src/lib/domain/{run,intel,weekly-plan,voice-profile}.ts. Plan: docs/FAZ2-PLAN.md §4.
-- Gerçek veri taşıyan veritabanına `migration up` ile UYGULANIR (db reset YOK): yalnız eklemeli değişiklik
-- (yeni sütun/tablo/fonksiyon); mevcut satırlar silinmez, yalnız yeni sütunlar doldurulur (aşağıdaki geri doldurmalar).

-- ── Koşular: faturalama biçimi + kullanım kesinleşmesi ─────
-- billing: metered = kullanıma göre ücretli (Apify, LLM API); subscription = abonelik (agy/Gemini CLI, Claude CLI):
-- actual_usd NULL kalır ve mutabakat listesine girmez (0 DEĞİL: "tutar yok, çağrı sayısı var").
alter table public.collection_runs
  add column billing text not null default 'metered' constraint collection_runs_billing_check check (billing in ('metered', 'subscription')),
  -- Apify kullanımı koşu bittikten sonra kademeli işlenir: actual_usd önce GEÇİCİ (yalnız yukarı) yazılır; ≥ 60 sn geçip
  -- iki ardışık okumada değer sabitlenince bu damga atılır ve reserved_usd yalnız o zaman gerçek tutara indirilir.
  -- NULL = kesinleşmedi (actual_usd varsa geçici alt sınırdır). Apify dışı sağlayıcılarda actual_usd yazıldığı anda kesindir.
  add column usage_settled_at timestamptz;
alter table public.collection_runs
  add constraint collection_runs_subscription_provider check (billing = 'metered' or provider in ('gemini', 'claude_cli'));
comment on column public.collection_runs.billing is 'metered = kullanıma göre ücretli · subscription = abonelik (actual_usd NULL, mutabakat yok).';
comment on column public.collection_runs.usage_settled_at is 'NULL = Apify kullanımı kesinleşmedi (actual_usd geçici alt sınır olabilir). Dolu = actual_usd kesin, reserved_usd indirildi.';

-- Geri doldurma: CLI sağlayıcıları tanım gereği abonelik; mevcut kesin (eski kurala göre mutabık) Apify koşuları kesinleşmiş sayılır.
update public.collection_runs set billing = 'subscription' where provider in ('gemini', 'claude_cli');
update public.collection_runs set usage_settled_at = coalesce(finished_at, updated_at) where provider = 'apify' and actual_usd is not null;

-- ── Bütçe rezervasyonu: billing anahtarı ───────────────────
-- 0001'deki reserve_budget ile AYNI imza ve tavan kuralları; tek fark p_run.billing ('metered' varsayılan | 'subscription').
-- Abonelik koşusu 0 USD rezerve eder (tavana takılmaz) ve yalnız gemini/claude_cli olabilir (tablo check'i).
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
    reserved_usd, price_unknown, expected_results, billing
  )
  values (
    p_ws, p_provider, btrim(p_run ->> 'kind'), 'reserved', p_run ->> 'target_label',
    p_run ->> 'external_run_id', p_run ->> 'dataset_id',
    p_amount, coalesce((p_run ->> 'price_unknown')::boolean, false), (p_run ->> 'expected_results')::integer,
    v_billing
  )
  returning * into v_run;

  return v_run;
end;
$$;
revoke all on function public.reserve_budget(uuid, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_budget(uuid, text, numeric, jsonb) to service_role;

-- ── Rakip / içerik küçük ekleri (Faz 1 eksikleri) ──────────
-- status_reason: rakip erişim hatasının (private/not_found) kısa sebebi; toplama yazar (ör. "hesap gizli").
alter table public.competitors
  add column status_reason text check (status_reason is null or char_length(status_reason) <= 300);

-- coauthors: ortak yazarların HERKESE AÇIK kullanıcı adları (keşif ağı için; kullanıcı kararı). Yorumcu/etiketlenen kimliği
-- ASLA saklanmaz; ad/kimlik/fotoğraf alanları da yok (yalnız kullanıcı adı).
alter table public.content_items
  add column coauthors text[] not null default '{}';
comment on column public.content_items.coauthors is 'Ortak yazarların herkese açık kullanıcı adları (keşif). Yorumcu verisi saklanmaz.';

-- ── Workspace: hedef kitle saat dilimi ─────────────────────
-- Paylaşım saati analizi ve haftalık plan takvimi HEDEF KİTLENİN saatinde (ör. America/New_York); NULL = timezone kullanılır.
alter table public.workspaces
  add column audience_timezone text check (audience_timezone is null or char_length(audience_timezone) between 1 and 64);

-- Seed workspace (Ornek): hedef kitle ABD, uyum bölgesi TR + US (kullanıcı kararı). Yalnız bu iki alan; idempotent.
-- Temiz kurulumda (db reset) workspace bu noktada yoktur: seed.sql aynı değerlerle ekler.
update public.workspaces
   set audience_timezone = 'America/New_York', compliance_region = 'TR_US'
 where id = '7a3f0000-0000-4000-8000-000000000001';

-- ── İçerik analizi: video analizi alanları ─────────────────
-- hook_source: hook'un geldiği kanal (speech = konuşulan ilk cümle · screen_text = ekran yazısı · caption = açıklama).
-- edit_metrics: kurgu ölçümleri (kesme sayısı, tempo, ekran yazısı …). evidence_report: sunucunun alıntı denetimi ayrıntısı.
-- backend: analizi yapan arka uç (agy = lokal Antigravity CLI · gemini-api = deploy). run_id: analizi üreten koşu (abonelik sayacı).
alter table public.content_analyses
  add column hook_source text check (hook_source is null or hook_source in ('speech', 'screen_text', 'caption')),
  add column edit_metrics jsonb check (edit_metrics is null or jsonb_typeof(edit_metrics) = 'object'),
  add column evidence_report jsonb check (evidence_report is null or jsonb_typeof(evidence_report) = 'object'),
  add column backend text check (backend is null or backend in ('agy', 'gemini-api')),
  add column run_id uuid;
alter table public.content_analyses
  add constraint content_analyses_run_fkey foreign key (run_id, workspace_id)
    references public.collection_runs (id, workspace_id) on delete set null (run_id);
create index content_analyses_run_idx on public.content_analyses (run_id) where run_id is not null;

comment on column public.transcripts.segments is '[{ "start": sn, "end": sn, "text": "...", "channel": "speech" | "screen" }]; channel yoksa speech sayılır (ekran yazısı = screen).';

-- ── Fikir kartı: ayrıntılar + kaynak ───────────────────────
-- details: script, açıklama taslağı, hedef süre, konu/çerçeve, KISA rakip alıntıları (kalıcı; transcript 90 günde silinse de kalır).
-- source: generated = fikir üretimi · weekly_plan = haftalık plan üretimi · manual = elle.
alter table public.ideas
  add column details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  add column source text not null default 'generated' check (source in ('generated', 'weekly_plan', 'manual'));

-- ── Ses profili ────────────────────────────────────────────
-- Hesap başına GÜNCEL marka sesi profili (yeni üretim üzerine yazılır). Özellikler kendi hesabın transcript'lerinden
-- birebir alıntıyla desteklenir; sayısal ön istatistik (stats) LLM'siz hesaplanır.
create table public.voice_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  social_account_id uuid not null,
  platform public.platform not null,
  language text check (language is null or language ~ '^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$'),
  -- 1–3 cümlelik sesin özeti (script üretimine girdi).
  summary text not null default '',
  -- [{ key, label, description, verified, examples: [{ contentItemId, quote }] }]
  traits jsonb not null default '[]'::jsonb check (jsonb_typeof(traits) = 'array'),
  -- { signaturePhrases: [], avoidPhrases: [] }
  lexicon jsonb not null default '{}'::jsonb check (jsonb_typeof(lexicon) = 'object'),
  -- Deterministik ön istatistik (VoiceStats): ölçülemeyen alan yazılmaz.
  stats jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object'),
  sample_size integer not null default 0 check (sample_size >= 0),
  taxonomy_version text not null check (btrim(taxonomy_version) <> ''),
  prompt_version text not null check (btrim(prompt_version) <> ''),
  model text,
  run_id uuid,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_profiles_account_unique unique (workspace_id, social_account_id),
  constraint voice_profiles_account_fkey foreign key (social_account_id, workspace_id, platform)
    references public.social_accounts (id, workspace_id, platform) on delete cascade,
  constraint voice_profiles_run_fkey foreign key (run_id, workspace_id)
    references public.collection_runs (id, workspace_id) on delete set null (run_id)
);
create index voice_profiles_run_idx on public.voice_profiles (run_id) where run_id is not null;
alter table public.voice_profiles enable row level security;
create trigger voice_profiles_set_updated_at before update on public.voice_profiles
  for each row execute function private.set_updated_at();

-- ── Haftalık plan ──────────────────────────────────────────
-- Hafta başına TEK plan (week_start = Pazartesi). Bölümler jsonb: { winners, focus, schedule, avoid, review }.
-- Yazan sunucu (save_weekly_plan RPC, service role); kullanıcı yalnız okur.
create table public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Plan hangi kendi hesap için (ses profili kaynağı); NULL = belirtilmedi.
  social_account_id uuid,
  platform public.platform not null default 'instagram',
  -- Haftanın Pazartesi'si (takvim günü; hedef kitle saat diliminde belirlenir).
  week_start date not null check (extract(isodow from week_start) = 1),
  -- draft = deterministik taslak (LLM adımı bitmedi) · ready = doğrulanmış plan · archived = eski.
  status text not null default 'ready' check (status in ('draft', 'ready', 'archived')),
  summary text,
  confidence text check (confidence is null or confidence in ('high', 'medium', 'low')),
  sections jsonb not null default '{}'::jsonb check (jsonb_typeof(sections) = 'object'),
  taxonomy_version text not null check (btrim(taxonomy_version) <> ''),
  prompt_version text not null check (btrim(prompt_version) <> ''),
  model text,
  -- Bu planı üreten koşular (collection_runs kimlikleri; abonelik çağrı sayacı).
  run_ids uuid[] not null default '{}',
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_plans_week_key unique (workspace_id, week_start),
  constraint weekly_plans_tenant_key unique (id, workspace_id),
  constraint weekly_plans_account_fkey foreign key (social_account_id, workspace_id, platform)
    references public.social_accounts (id, workspace_id, platform) on delete set null (social_account_id)
);
create index weekly_plans_week_idx on public.weekly_plans (workspace_id, week_start desc);
alter table public.weekly_plans enable row level security;
create trigger weekly_plans_set_updated_at before update on public.weekly_plans
  for each row execute function private.set_updated_at();

-- Bu plan için üretilen fikirler. `position` dolu = plana girdi (3–5 içerik: takvimdeki sıra); NULL = aday (üretildi ama
-- plana alınmadı; kullanıcı değiştirmek isterse buradan seçer). Yeniden üretimde eski adaylar da temizlenebilsin diye
-- adaylar da satır alır.
create table public.weekly_plan_items (
  plan_id uuid not null,
  idea_id uuid not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  position smallint check (position is null or position between 1 and 7),
  -- Önerilen paylaşım anı (UTC); gösterim hedef kitle + İstanbul saatinde. NULL = slot atanmadı (adaylarda hep NULL).
  slot_at timestamptz,
  -- Slot gerekçesi: kendi en iyi saat · kendi iyi saatleri · rakip sabit saati (kısa Türkçe metin).
  slot_note text,
  created_at timestamptz not null default now(),
  primary key (plan_id, idea_id),
  constraint weekly_plan_items_position_key unique (plan_id, position),
  constraint weekly_plan_items_plan_fkey foreign key (plan_id, workspace_id)
    references public.weekly_plans (id, workspace_id) on delete cascade,
  constraint weekly_plan_items_idea_fkey foreign key (idea_id, workspace_id)
    references public.ideas (id, workspace_id) on delete cascade
);
-- "Bu fikir hangi planda?" (Fikirler plan rozeti) + fikir silinirken FK araması.
create index weekly_plan_items_idea_idx on public.weekly_plan_items (workspace_id, idea_id);
alter table public.weekly_plan_items enable row level security;

-- ── Haftalık planı atomik kaydet ───────────────────────────
-- Plan + fikirler + fikir kanıtları + plan öğeleri TEK transaction'da. Aynı hafta yeniden üretilirse plan güncellenir,
-- öğeler yeniden kurulur; eski planın kullanıcının HİÇ dokunmadığı (`new`) fikirleri (adaylar dahil) silinir, ilerletilmiş
-- fikirler (saved/scripted/…) korunur (yalnız plan bağı kalkar). Yalnız service role çağırır.
-- p_payload: {
--   account_id?: uuid, status?: 'draft'|'ready'|'archived', summary?: text, confidence?: 'high'|'medium'|'low',
--   sections: {winners, focus, schedule, avoid, review}, taxonomy_version, prompt_version, model?, run_ids?: uuid[],
--   ideas: [{ title, rationale?, platform?, format?, hook_type?, hooks?: text[], script_outline?: text[], rank_score?,
--             rank_inputs?: {}, details?: {}, source?, evidence: [{content_item_id, lift_at_creation}] (≥ 2),
--             position?: 1..7 (verilmişse plana girer; yoksa aday), slot_at?: timestamptz, slot_note?: text }]
-- }
create function public.save_weekly_plan(p_ws uuid, p_week date, p_payload jsonb)
returns public.weekly_plans
language plpgsql
set search_path = ''
as $$
declare
  v_plan public.weekly_plans;
  v_account uuid;
  v_platform public.platform;
  v_idea jsonb;
  v_idea_id uuid;
  v_evidence jsonb;
  v_position smallint;
  v_stale uuid[];
  v_run_ids uuid[];
begin
  if p_ws is null or p_week is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  if extract(isodow from p_week) <> 1 then
    raise exception 'week_start_not_monday' using errcode = '22023', detail = p_week::text;
  end if;
  if jsonb_typeof(p_payload -> 'sections') is distinct from 'object' then
    raise exception 'sections_required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_payload -> 'ideas', '[]'::jsonb)) <> 'array' then
    raise exception 'ideas_must_be_array' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspaces w where w.id = p_ws) then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  -- Aynı workspace + hafta için eşzamanlı kayıtlar sıraya girer.
  perform pg_advisory_xact_lock(hashtextextended('save_weekly_plan:' || p_ws::text || ':' || p_week::text, 0));

  v_account := nullif(p_payload ->> 'account_id', '')::uuid;
  v_platform := 'instagram';
  if v_account is not null then
    select a.platform into v_platform from public.social_accounts a where a.id = v_account and a.workspace_id = p_ws;
    if not found then
      raise exception 'account_not_found' using errcode = 'P0002', detail = v_account::text;
    end if;
  end if;
  v_run_ids := array(
    select r.value::uuid from jsonb_array_elements_text(coalesce(p_payload -> 'run_ids', '[]'::jsonb)) as r(value)
  );

  -- Eski planın dokunulmamış fikirleri (yeniden üretimde temizlenir).
  select coalesce(array_agg(i.id), '{}') into v_stale
    from public.weekly_plans p
    join public.weekly_plan_items it on it.plan_id = p.id and it.workspace_id = p.workspace_id
    join public.ideas i on i.id = it.idea_id and i.workspace_id = it.workspace_id
   where p.workspace_id = p_ws and p.week_start = p_week and i.status = 'new' and i.source = 'weekly_plan';

  insert into public.weekly_plans (
    workspace_id, social_account_id, platform, week_start, status, summary, confidence, sections,
    taxonomy_version, prompt_version, model, run_ids, generated_at
  )
  values (
    p_ws, v_account, v_platform, p_week, coalesce(p_payload ->> 'status', 'ready'), p_payload ->> 'summary',
    p_payload ->> 'confidence', p_payload -> 'sections',
    p_payload ->> 'taxonomy_version', p_payload ->> 'prompt_version', p_payload ->> 'model', v_run_ids, now()
  )
  on conflict (workspace_id, week_start) do update set
    social_account_id = excluded.social_account_id,
    platform = excluded.platform,
    status = excluded.status,
    summary = excluded.summary,
    confidence = excluded.confidence,
    sections = excluded.sections,
    taxonomy_version = excluded.taxonomy_version,
    prompt_version = excluded.prompt_version,
    model = excluded.model,
    run_ids = excluded.run_ids,
    generated_at = excluded.generated_at
  returning * into v_plan;

  delete from public.weekly_plan_items where plan_id = v_plan.id;
  if array_length(v_stale, 1) is not null then
    delete from public.ideas where workspace_id = p_ws and id = any (v_stale);
  end if;

  for v_idea in select e.value from jsonb_array_elements(coalesce(p_payload -> 'ideas', '[]'::jsonb)) as e(value) loop
    if jsonb_typeof(v_idea) <> 'object' then
      raise exception 'idea_must_be_object' using errcode = '22023';
    end if;
    -- Her fikir ≥ 2 farklı kanıt içeriğine dayanır (uygulama kuralı, burada da güvence).
    if jsonb_typeof(v_idea -> 'evidence') is distinct from 'array'
       or (select count(distinct ev.value ->> 'content_item_id') from jsonb_array_elements(v_idea -> 'evidence') as ev(value)) < 2 then
      raise exception 'idea_needs_two_evidence' using errcode = '22023', detail = coalesce(v_idea ->> 'title', '?');
    end if;

    insert into public.ideas (
      workspace_id, title, rationale, platform, format, hook_type, hooks, script_outline, rank_score, rank_inputs, details, source
    )
    values (
      p_ws,
      v_idea ->> 'title',
      coalesce(v_idea ->> 'rationale', ''),
      coalesce(v_idea ->> 'platform', 'instagram')::public.platform,
      coalesce(v_idea ->> 'format', 'short_video')::public.content_format,
      nullif(v_idea ->> 'hook_type', ''),
      coalesce(v_idea -> 'hooks', '[]'::jsonb),
      coalesce(v_idea -> 'script_outline', '[]'::jsonb),
      coalesce((v_idea ->> 'rank_score')::double precision, 0),
      coalesce(v_idea -> 'rank_inputs', '{}'::jsonb),
      coalesce(v_idea -> 'details', '{}'::jsonb),
      coalesce(v_idea ->> 'source', 'weekly_plan')
    )
    returning id into v_idea_id;

    for v_evidence in select ev.value from jsonb_array_elements(v_idea -> 'evidence') as ev(value) loop
      insert into public.idea_evidence (idea_id, content_item_id, workspace_id, lift_at_creation)
      values (
        v_idea_id,
        (v_evidence ->> 'content_item_id')::uuid,
        p_ws,
        coalesce((v_evidence ->> 'lift_at_creation')::double precision, 0)
      )
      on conflict (idea_id, content_item_id) do nothing;
    end loop;

    -- Her fikir plana bağlanır; `position` verilmişse plana girmiştir, verilmezse aday kalır.
    v_position := nullif(v_idea ->> 'position', '')::smallint;
    insert into public.weekly_plan_items (plan_id, idea_id, workspace_id, position, slot_at, slot_note)
    values (v_plan.id, v_idea_id, p_ws, v_position, nullif(v_idea ->> 'slot_at', '')::timestamptz, nullif(v_idea ->> 'slot_note', ''));
  end loop;

  return v_plan;
end;
$$;
revoke all on function public.save_weekly_plan(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.save_weekly_plan(uuid, date, jsonb) to service_role;

-- ── Yetki + RLS (yeni tablolar) ────────────────────────────
-- 0001'deki varsayılan yetkiler istemci rollerine kapalı; service role'e açıkça verilir. Üyeler okur, yazan yalnız sunucu.
grant all on public.voice_profiles, public.weekly_plans, public.weekly_plan_items to service_role;
grant select on public.voice_profiles, public.weekly_plans, public.weekly_plan_items to authenticated;

create policy "voice_profiles: üye okur" on public.voice_profiles
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "weekly_plans: üye okur" on public.weekly_plans
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "weekly_plan_items: üye okur" on public.weekly_plan_items
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
