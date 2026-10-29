-- panel — 0035: plan onayı (SPN-35). YALNIZ EKLEMELİ: `weekly_plans.approved_at` / `approved_by` (NULL'lu), `approve_weekly_plan` RPC'si,
-- `save_weekly_plan` yeni sürümü (`create or replace`; 0025 ile AYNI, tek fark: yeniden üretimde onay SIFIRLANIR).
-- Şema ↔ domain: src/lib/domain/weekly-plan.ts (`WeeklyPlan.approvedAt`). Uygulama: `npx -y supabase@2.118.0 migration up --local` (db reset YOK).
--
-- `save_weekly_plan` hafta başına TEK satırı `on conflict do update` ile günceller (yeni satır açmaz) → onay sütunları orada sıfırlanır.
-- `approve_weekly_plan`: yalnız `ready` plan onaylanır; onay verilince DEĞİŞMEZ (ikinci çağrı aynı satırı döndürür, saat yeniden yazılmaz);
-- planın PLANA GİREN (position dolu) fikirlerinden `new` olanları `saved` yapar (seçim); `dismissed` / ileri durumdakilere dokunmaz. Hepsi tek işlem.

alter table public.weekly_plans
  add column approved_at timestamptz,
  add column approved_by uuid,
  add constraint weekly_plans_approval_pair check (approved_by is null or approved_at is not null);
comment on column public.weekly_plans.approved_at is 'Müşterinin "Planı onayla" anı. NULL = onaylanmadı. Yeniden üretimde sıfırlanır.';
comment on column public.weekly_plans.approved_by is 'Onaylayan kullanıcı (yerel tek kullanıcı döneminde NULL olabilir).';

create or replace function public.save_weekly_plan(p_ws uuid, p_week date, p_payload jsonb)
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
  v_lift double precision;
  v_position smallint;
  v_stale uuid[];
  v_run_ids uuid[];
  v_brief jsonb;
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
  -- Brif (Kreatif direktör): verilmezse / null ise NULL = brifsiz plan; nesne değilse hata.
  v_brief := p_payload -> 'brief';
  if jsonb_typeof(v_brief) = 'null' then v_brief := null; end if;
  if v_brief is not null and jsonb_typeof(v_brief) <> 'object' then
    raise exception 'brief_must_be_object' using errcode = '22023';
  end if;
  v_run_ids := array(
    select r.value::uuid from jsonb_array_elements_text(coalesce(p_payload -> 'run_ids', '[]'::jsonb)) as r(value)
  );

  -- Eski planın dokunulmamış fikirleri (yeniden üretimde temizlenir); yayın işine bağlı fikir silinmez (b).
  select coalesce(array_agg(i.id), '{}') into v_stale
    from public.weekly_plans p
    join public.weekly_plan_items it on it.plan_id = p.id and it.workspace_id = p.workspace_id
    join public.ideas i on i.id = it.idea_id and i.workspace_id = it.workspace_id
   where p.workspace_id = p_ws and p.week_start = p_week and i.status = 'new' and i.source = 'weekly_plan'
     and not exists (select 1 from public.publish_jobs j where j.idea_id = i.id and j.workspace_id = i.workspace_id);

  insert into public.weekly_plans (
    workspace_id, social_account_id, platform, week_start, status, summary, confidence, sections,
    taxonomy_version, prompt_version, model, run_ids, generated_at, brief
  )
  values (
    p_ws, v_account, v_platform, p_week, coalesce(p_payload ->> 'status', 'ready'), p_payload ->> 'summary',
    p_payload ->> 'confidence', p_payload -> 'sections',
    p_payload ->> 'taxonomy_version', p_payload ->> 'prompt_version', p_payload ->> 'model', v_run_ids, now(),
    v_brief
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
    generated_at = excluded.generated_at,
    brief = excluded.brief,
    -- Yeniden üretilen plan başka bir plandır: önceki onay geçerli değildir (SPN-35).
    approved_at = null,
    approved_by = null
  returning * into v_plan;

  -- (d) Mevcut öğeler aday olur (sıra/slot temizlenir: yeni öğeler sıraları alabilsin); korunan fikirler plan bağını kaybetmez.
  update public.weekly_plan_items set position = null, slot_at = null, slot_note = null, brief_slot = null where plan_id = v_plan.id;
  -- (a) + (b) Silme anında da doğrulanır: seçimden sonra ilerletilen ya da yayın işine bağlanan fikir silinmez. Öğesi cascade ile gider.
  if array_length(v_stale, 1) is not null then
    delete from public.ideas i
     where i.workspace_id = p_ws and i.id = any (v_stale) and i.status = 'new'
       and not exists (select 1 from public.publish_jobs j where j.idea_id = i.id and j.workspace_id = i.workspace_id);
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
      -- (c) Lift yok ya da null → NULL (ölçülemedi); sayı → değer; başka tür → hata. 0'a çevrilmez.
      v_lift := null;
      if jsonb_typeof(v_evidence -> 'lift_at_creation') = 'number' then
        v_lift := (v_evidence ->> 'lift_at_creation')::double precision;
      elsif jsonb_typeof(v_evidence -> 'lift_at_creation') is not null and jsonb_typeof(v_evidence -> 'lift_at_creation') <> 'null' then
        raise exception 'evidence_lift_invalid' using errcode = '22023', detail = coalesce(v_idea ->> 'title', '?');
      end if;
      insert into public.idea_evidence (idea_id, content_item_id, workspace_id, lift_at_creation)
      values (v_idea_id, (v_evidence ->> 'content_item_id')::uuid, p_ws, v_lift)
      on conflict (idea_id, content_item_id) do nothing;
    end loop;

    -- Her fikir plana bağlanır; `position` verilmişse plana girmiştir, verilmezse aday kalır.
    v_position := nullif(v_idea ->> 'position', '')::smallint;
    insert into public.weekly_plan_items (plan_id, idea_id, workspace_id, position, slot_at, slot_note, brief_slot)
    values (v_plan.id, v_idea_id, p_ws, v_position, nullif(v_idea ->> 'slot_at', '')::timestamptz, nullif(v_idea ->> 'slot_note', ''), nullif(v_idea ->> 'brief_slot', ''));
  end loop;

  return v_plan;
end;
$$;
revoke all on function public.save_weekly_plan(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.save_weekly_plan(uuid, date, jsonb) to service_role;

create function public.approve_weekly_plan(p_ws uuid, p_week date, p_by uuid, p_now timestamptz)
returns public.weekly_plans
language plpgsql
set search_path = ''
as $$
declare
  v_plan public.weekly_plans;
begin
  if p_ws is null or p_week is null or p_now is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('save_weekly_plan:' || p_ws::text || ':' || p_week::text, 0));

  select * into v_plan from public.weekly_plans where workspace_id = p_ws and week_start = p_week for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  if v_plan.status <> 'ready' then
    raise exception 'plan_not_ready' using errcode = '22023', detail = v_plan.status;
  end if;
  if v_plan.approved_at is not null then
    return v_plan;
  end if;

  update public.ideas i set status = 'saved'
   where i.workspace_id = p_ws and i.status = 'new'
     and i.id in (select it.idea_id from public.weekly_plan_items it where it.plan_id = v_plan.id and it.workspace_id = p_ws and it.position is not null);

  update public.weekly_plans set approved_at = p_now, approved_by = p_by where id = v_plan.id returning * into v_plan;
  return v_plan;
end;
$$;
revoke all on function public.approve_weekly_plan(uuid, date, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.approve_weekly_plan(uuid, date, uuid, timestamptz) to service_role;
