-- 0009: save_weekly_plan düzeltmeleri (Faz 2 kod incelemesi, F2.3). YALNIZ EKLEMELİ: fonksiyon `create or replace`, bir kolon kısıtı gevşer;
-- hiçbir veri silinmez/değişmez. Uygulama: `npx -y supabase@2.118.0 migration up --local` (db reset YOK).
--
--  (a) Yarış durumu: silinecek fikirler seçildikten sonra kullanıcı birini ilerletirse (new → saved) o fikir yine silinirdi;
--      silme sorgusu artık `status = 'new'`'i yeniden doğrular.
--  (b) Bir yayın işine (publish_jobs) bağlı fikir silinmez (FK `on delete set null` bağı sessizce koparırdı).
--  (c) `undefined ≠ 0`: ölçülemeyen lift `coalesce(…, 0)` ile 0'a çevriliyordu. `lift_at_creation` artık NULL olabilir (NULL = ölçülemedi);
--      sayı değilse hata (`evidence_lift_invalid`).
--  (d) Korunan fikirler (new olmayan ya da yayın işine bağlı) plan bağını KAYBETMEZ: eski öğe `position/slot` temizlenerek aday olarak
--      (position NULL) planda kalır. Silinen fikirlerin öğeleri fikirle birlikte gider (FK cascade).

alter table public.idea_evidence alter column lift_at_creation drop not null;
comment on column public.idea_evidence.lift_at_creation is 'Fikir üretildiği andaki lift. NULL = ölçülemedi (0 DEĞİL).';

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

  -- Eski planın dokunulmamış fikirleri (yeniden üretimde temizlenir); yayın işine bağlı fikir silinmez (b).
  select coalesce(array_agg(i.id), '{}') into v_stale
    from public.weekly_plans p
    join public.weekly_plan_items it on it.plan_id = p.id and it.workspace_id = p.workspace_id
    join public.ideas i on i.id = it.idea_id and i.workspace_id = it.workspace_id
   where p.workspace_id = p_ws and p.week_start = p_week and i.status = 'new' and i.source = 'weekly_plan'
     and not exists (select 1 from public.publish_jobs j where j.idea_id = i.id and j.workspace_id = i.workspace_id);

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

  -- (d) Mevcut öğeler aday olur (sıra/slot temizlenir: yeni öğeler sıraları alabilsin); korunan fikirler plan bağını kaybetmez.
  update public.weekly_plan_items set position = null, slot_at = null, slot_note = null where plan_id = v_plan.id;
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
    insert into public.weekly_plan_items (plan_id, idea_id, workspace_id, position, slot_at, slot_note)
    values (v_plan.id, v_idea_id, p_ws, v_position, nullif(v_idea ->> 'slot_at', '')::timestamptz, nullif(v_idea ->> 'slot_note', ''));
  end loop;

  return v_plan;
end;
$$;
revoke all on function public.save_weekly_plan(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.save_weekly_plan(uuid, date, jsonb) to service_role;
