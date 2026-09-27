-- RED-TIC · I0b · Funciones y helpers (correcciones Fase 9)
-- Todas las escrituras sensibles pasan por funciones SECURITY DEFINER con autorización interna.

-- ── Helpers ────────────────────────────────────────────────────────────────

-- Hash del código individual. Portable (sha256 es parte del núcleo de PostgreSQL).
-- En producción puede sustituirse por bcrypt (pgcrypto) sin cambiar a los llamadores.
create or replace function public.hash_code(p_code text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(upper(btrim(p_code)), 'UTF8')), 'hex')
$$;

-- Matrícula de la sesión actual (null si no hay binding activo y no expirado).
create or replace function public.current_enrollment_id()
returns uuid language sql stable security definer set search_path = public, auth as $$
  select b.student_enrollment_id
  from public.student_session_binding b
  where b.auth_uid = auth.uid()
    and b.state = 'active'
    and b.expires_at > now()
  order by b.issued_at desc
  limit 1
$$;

create or replace function public.course_of_enrollment(p_enrollment uuid)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select se.course_id from public.student_enrollment se where se.id = p_enrollment
$$;

-- Corrección 6: la autorización docente une teacher.auth_user_id con auth.uid().
create or replace function public.is_teacher_of_course(p_course uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1
    from public.teacher_course tc
    join public.teacher t on t.id = tc.teacher_id
    where t.auth_user_id = auth.uid()
      and tc.course_id = p_course
  )
$$;

create or replace function public.is_team_member_of_delivery(p_delivery uuid, p_enrollment uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1
    from public.delivery d
    join public.team_member tm on tm.team_id = d.team_id
    where d.id = p_delivery and tm.student_enrollment_id = p_enrollment
  )
$$;

-- Corrección 7: acceso a una entrega = propietario, miembro del equipo o docente del curso.
create or replace function public.can_access_delivery(p_delivery uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1
    from public.delivery d
    where d.id = p_delivery
      and (
        d.owner_enrollment_id = public.current_enrollment_id()
        or (d.team_id is not null and public.is_team_member_of_delivery(d.id, public.current_enrollment_id()))
        or public.is_teacher_of_course(public.course_of_enrollment(d.owner_enrollment_id))
      )
  )
$$;

create or replace function public.milestone_in_course(p_milestone uuid, p_course uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1
    from public.milestone m
    join public.mission mi on mi.id = m.mission_id
    join public.program_version pv on pv.id = mi.program_version_id
    join public.course c on c.program_version_id = pv.id
    where m.id = p_milestone and c.id = p_course
  )
$$;

-- Corrección 4: autorización de Storage amarrada a filas reales.
-- Ruta: course/{course}/enrollment/{enrollment}/delivery/{delivery}/{archivo}
create or replace function public.evidence_object_allowed(p_bucket text, p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = public, auth as $$
declare
  a text[] := string_to_array(p_name, '/');
  v_delivery uuid;
begin
  if p_bucket <> 'evidence' then return false; end if;
  if a is null or array_length(a, 1) < 6 then return false; end if;
  if a[1] <> 'course' or a[3] <> 'enrollment' or a[5] <> 'delivery' then return false; end if;

  begin
    v_delivery := a[6]::uuid;
  exception when others then
    return false;
  end;

  -- Debe existir una entrega real cuyo curso coincida con la ruta.
  if not exists (
    select 1 from public.delivery d
    where d.id = v_delivery
      and public.course_of_enrollment(d.owner_enrollment_id)::text = a[2]
  ) then
    return false;
  end if;

  -- La matrícula de la ruta debe ser el propietario o un miembro del equipo.
  if not exists (
    select 1 from public.delivery d
    where d.id = v_delivery
      and (
        d.owner_enrollment_id::text = a[4]
        or exists (
          select 1 from public.team_member tm
          where tm.team_id = d.team_id and tm.student_enrollment_id::text = a[4]
        )
      )
  ) then
    return false;
  end if;

  if not public.can_access_delivery(v_delivery) then return false; end if;

  -- Escritura: solo en la ruta de la propia matrícula.
  if p_write then
    return a[4] = public.current_enrollment_id()::text;
  end if;

  return true;
end $$;

-- ── Operaciones de identidad ───────────────────────────────────────────────

-- Corrección 5: lookup por hash indexado, límite de intentos, bloqueo y serialización.
-- Devuelve un estado en vez de lanzar excepción, para que el intento fallido quede registrado
-- (una excepción revertiría el INSERT del intento dentro de la misma transacción).
create or replace function public.redeem_code(p_code text, p_client_key text default 'local')
returns table (status text, pseudonym text, expires_at timestamptz)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_hash text := public.hash_code(p_code);
  v_cred public.code_credential%rowtype;
  v_expires timestamptz := now() + interval '12 hours';
  v_recent int;
begin
  if auth.uid() is null then
    return query select 'no_session'::text, null::text, null::timestamptz;
    return;
  end if;

  select count(*) into v_recent
  from public.redeem_attempt
  where client_key = p_client_key
    and success = false
    and attempted_at > now() - interval '10 minutes';
  if v_recent >= 10 then
    return query select 'rate_limited'::text, null::text, null::timestamptz;
    return;
  end if;

  -- Bloqueo de la credencial: serializa canjes concurrentes del mismo código.
  select * into v_cred
  from public.code_credential
  where code_hash = v_hash
  for update;

  if v_cred.id is null then
    insert into public.redeem_attempt (client_key, success) values (p_client_key, false);
    return query select 'invalid'::text, null::text, null::timestamptz;
    return;
  end if;

  if v_cred.state <> 'active' then
    insert into public.redeem_attempt (client_key, success) values (p_client_key, false);
    return query select 'revoked'::text, null::text, null::timestamptz;
    return;
  end if;

  if v_cred.locked_until is not null and v_cred.locked_until > now() then
    insert into public.redeem_attempt (client_key, success) values (p_client_key, false);
    return query select 'locked'::text, null::text, null::timestamptz;
    return;
  end if;

  -- Revoca bindings previos de la matrícula o del auth_uid.
  update public.student_session_binding
     set state = 'revoked', revoked_at = now(), revoked_reason = 'nuevo canje'
   where state = 'active'
     and (student_enrollment_id = v_cred.student_enrollment_id or auth_uid = auth.uid());

  insert into public.student_session_binding (auth_uid, student_enrollment_id, state, issued_at, expires_at)
  values (auth.uid(), v_cred.student_enrollment_id, 'active', now(), v_expires);

  update public.code_credential
     set last_used_at = now(), failed_attempts = 0, locked_until = null
   where id = v_cred.id;

  insert into public.redeem_attempt (client_key, success) values (p_client_key, true);

  return query
    select 'ok'::text, se.pseudonym, v_expires
    from public.student_enrollment se
    where se.id = v_cred.student_enrollment_id;
end $$;

create or replace function public.regenerate_code(p_enrollment uuid)
returns text
language plpgsql security definer set search_path = public, auth as $$
declare
  v_course uuid := public.course_of_enrollment(p_enrollment);
  v_plain text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  if not public.is_teacher_of_course(v_course) then
    raise exception 'no autorizado';
  end if;

  update public.code_credential set state = 'revoked', revoked_at = now()
   where student_enrollment_id = p_enrollment and state = 'active';

  update public.student_session_binding
     set state = 'revoked', revoked_at = now(), revoked_reason = 'regeneración de código'
   where student_enrollment_id = p_enrollment and state = 'active';

  insert into public.code_credential (student_enrollment_id, code_hash)
  values (p_enrollment, public.hash_code(v_plain));

  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id)
  values (auth.uid(), 'teacher', 'regenerate_code', 'student_enrollment', p_enrollment);

  return v_plain;
end $$;

create or replace function public.revoke_session(p_enrollment uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_teacher_of_course(public.course_of_enrollment(p_enrollment)) then
    raise exception 'no autorizado';
  end if;

  update public.student_session_binding
     set state = 'revoked', revoked_at = now(), revoked_reason = p_reason
   where student_enrollment_id = p_enrollment and state = 'active';

  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, meta)
  values (auth.uid(), 'teacher', 'revoke_session', 'student_enrollment', p_enrollment,
          jsonb_build_object('reason', p_reason));
end $$;

-- ── Operaciones de entrega ─────────────────────────────────────────────────

-- Corrección 1: el estudiante no escribe delivery directamente; esta función lo crea.
create or replace function public.start_delivery(p_milestone uuid)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_enrollment uuid := public.current_enrollment_id();
  v_course uuid;
  v_delivery uuid;
begin
  if v_enrollment is null then
    raise exception 'no autorizado';
  end if;

  v_course := public.course_of_enrollment(v_enrollment);
  if not public.milestone_in_course(p_milestone, v_course) then
    raise exception 'el hito no pertenece a tu curso';
  end if;

  insert into public.delivery (owner_enrollment_id, milestone_id, scope, state)
  values (v_enrollment, p_milestone, 'individual', 'not_started')
  on conflict (owner_enrollment_id, milestone_id) do update set updated_at = now()
  returning id into v_delivery;

  return v_delivery;
end $$;

-- Corrección 2: idempotencia ANTES del estado, serializando por delivery.
create or replace function public.submit_evidence(
  p_delivery uuid,
  p_submit_key uuid,
  p_format text,
  p_text_content text default null,
  p_description text default null
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_delivery public.delivery%rowtype;
  v_existing uuid;
  v_last int;
  v_new uuid;
begin
  select * into v_delivery from public.delivery where id = p_delivery for update;
  if v_delivery.id is null then raise exception 'entrega inexistente'; end if;
  if v_delivery.owner_enrollment_id <> public.current_enrollment_id() then
    raise exception 'solo el propietario puede entregar';
  end if;

  -- Idempotencia primero: un reenvío con la misma clave devuelve el recibo anterior.
  select id into v_existing
  from public.evidence_version
  where delivery_id = p_delivery and submit_key = p_submit_key;
  if v_existing is not null then
    return v_existing;
  end if;

  if v_delivery.state not in ('not_started','in_progress') then
    raise exception 'la entrega no admite envíos en su estado actual';
  end if;

  select coalesce(max(version), 0) + 1 into v_last
  from public.evidence_version where delivery_id = p_delivery;

  insert into public.evidence_version
    (delivery_id, version, origin, format, test_modality, text_content, description, submit_key, created_by)
  values (p_delivery, v_last, 'student_digital', p_format, 'not_applicable', p_text_content, p_description, p_submit_key, auth.uid())
  returning id into v_new;

  update public.delivery
     set state = 'pending_review', current_evidence_id = v_new, updated_at = now()
   where id = p_delivery;

  return v_new;
end $$;

-- Registro docente de evidencia equivalente (sin entrega digital previa).
create or replace function public.register_equivalent_evidence(
  p_enrollment uuid,
  p_milestone uuid,
  p_format text,
  p_description text,
  p_test_modality text default 'not_applicable'
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_course uuid := public.course_of_enrollment(p_enrollment);
  v_delivery uuid;
  v_new uuid;
begin
  if not public.is_teacher_of_course(v_course) then raise exception 'no autorizado'; end if;

  insert into public.delivery (owner_enrollment_id, milestone_id, scope, state)
  values (p_enrollment, p_milestone, 'individual', 'pending_review')
  on conflict (owner_enrollment_id, milestone_id) do update set updated_at = now()
  returning id into v_delivery;

  insert into public.evidence_version
    (delivery_id, version, origin, format, test_modality, description, created_by)
  values (v_delivery, 1, 'teacher_equivalent', p_format, p_test_modality, p_description, auth.uid())
  returning id into v_new;

  update public.delivery
     set current_evidence_id = v_new, state = 'pending_review', updated_at = now()
   where id = v_delivery;

  return v_new;
end $$;

-- Corrección 3: exige evidencia vigente, descriptores válidos, asociación milestone_indicator,
-- historial y valor de XP, todo en una transacción. Soporta equipos por matrícula.
create or replace function public.validate_milestone(
  p_delivery uuid,
  p_assessments jsonb,
  p_comment text default null
) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  v_delivery public.delivery%rowtype;
  v_course uuid;
  v_pv uuid;
  v_item jsonb;
  v_enrollment uuid;
  v_indicator uuid;
  v_level text;
  v_xp int;
  v_count int := 0;
begin
  select * into v_delivery from public.delivery where id = p_delivery for update;
  if v_delivery.id is null then raise exception 'entrega inexistente'; end if;

  v_course := public.course_of_enrollment(v_delivery.owner_enrollment_id);
  if not public.is_teacher_of_course(v_course) then raise exception 'no autorizado'; end if;

  if v_delivery.current_evidence_id is null then
    raise exception 'la entrega no tiene evidencia vigente';
  end if;
  if p_assessments is null or jsonb_array_length(p_assessments) = 0 then
    raise exception 'se requiere al menos una valoración';
  end if;

  select mi.program_version_id into v_pv
  from public.milestone m
  join public.mission mi on mi.id = m.mission_id
  where m.id = v_delivery.milestone_id;

  for v_item in select * from jsonb_array_elements(p_assessments) loop
    v_enrollment := coalesce((v_item->>'enrollment_id')::uuid, v_delivery.owner_enrollment_id);
    v_indicator := (v_item->>'indicator_id')::uuid;
    v_level := v_item->>'level';

    if v_level not in ('incipient','developing','achieved','transferable') then
      raise exception 'nivel inválido: %', v_level;
    end if;

    if v_enrollment <> v_delivery.owner_enrollment_id
       and not public.is_team_member_of_delivery(p_delivery, v_enrollment) then
      raise exception 'la matrícula % no pertenece a la entrega', v_enrollment;
    end if;

    if not exists (
      select 1 from public.milestone_indicator mi
      where mi.milestone_id = v_delivery.milestone_id and mi.indicator_id = v_indicator
    ) then
      raise exception 'el indicador % no corresponde al hito', v_indicator;
    end if;

    -- Historial solo cuando cambia el nivel.
    insert into public.assessment_history (assessment_id, previous_level, new_level, comment, changed_by)
    select a.id, a.level, v_level, coalesce(v_item->>'comment', p_comment), auth.uid()
    from public.assessment a
    where a.student_enrollment_id = v_enrollment
      and a.indicator_id = v_indicator
      and a.milestone_id = v_delivery.milestone_id
      and a.level <> v_level;

    insert into public.assessment
      (student_enrollment_id, indicator_id, milestone_id, level, comment, evidence_version_id, validated_by, validated_at)
    values
      (v_enrollment, v_indicator, v_delivery.milestone_id, v_level,
       coalesce(v_item->>'comment', p_comment), v_delivery.current_evidence_id, auth.uid(), now())
    on conflict (student_enrollment_id, indicator_id, milestone_id)
    do update set level = excluded.level, comment = excluded.comment,
                  evidence_version_id = excluded.evidence_version_id,
                  validated_by = excluded.validated_by, validated_at = now();

    -- XP idempotente por matrícula.
    select xr.xp_value into v_xp
    from public.milestone m join public.xp_rule xr on xr.id = m.xp_rule_id
    where m.id = v_delivery.milestone_id;

    insert into public.xp_event
      (student_enrollment_id, milestone_id, program_version_id, xp_value, xp_rule_id, validated_by)
    values
      (v_enrollment, v_delivery.milestone_id, v_pv, coalesce(v_xp, 0),
       (select xp_rule_id from public.milestone where id = v_delivery.milestone_id), auth.uid())
    on conflict (student_enrollment_id, milestone_id, program_version_id)
    do update set xp_value = excluded.xp_value, validated_by = excluded.validated_by,
                  validated_at = now(), revoked_at = null, revoked_reason = null
    where public.xp_event.revoked_at is not null;

    v_count := v_count + 1;
  end loop;

  update public.delivery set state = 'achieved', updated_at = now() where id = p_delivery;

  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, meta)
  values (auth.uid(), 'teacher', 'validate_milestone', 'delivery', p_delivery,
          jsonb_build_object('assessments', v_count));

  return jsonb_build_object('status', 'achieved', 'assessments', v_count);
end $$;

create or replace function public.correct_assessment(
  p_assessment uuid, p_new_level text, p_comment text
) returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_enrollment uuid;
begin
  select a.student_enrollment_id into v_enrollment
  from public.assessment a where a.id = p_assessment for update;
  if v_enrollment is null then raise exception 'valoración inexistente'; end if;
  if not public.is_teacher_of_course(public.course_of_enrollment(v_enrollment)) then
    raise exception 'no autorizado';
  end if;
  if p_new_level not in ('not_evaluated','incipient','developing','achieved','transferable') then
    raise exception 'nivel inválido';
  end if;

  insert into public.assessment_history (assessment_id, previous_level, new_level, comment, changed_by)
  select p_assessment, a.level, p_new_level, p_comment, auth.uid()
  from public.assessment a where a.id = p_assessment;

  update public.assessment
     set level = p_new_level, comment = p_comment, validated_by = auth.uid(), validated_at = now()
   where id = p_assessment;
end $$;

create or replace function public.revoke_xp(p_xp_event uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_enrollment uuid;
begin
  select x.student_enrollment_id into v_enrollment
  from public.xp_event x where x.id = p_xp_event for update;
  if v_enrollment is null then raise exception 'evento inexistente'; end if;
  if not public.is_teacher_of_course(public.course_of_enrollment(v_enrollment)) then
    raise exception 'no autorizado';
  end if;
  update public.xp_event set revoked_at = now(), revoked_reason = p_reason where id = p_xp_event;
end $$;

create or replace function public.reopen_milestone(p_delivery uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_delivery public.delivery%rowtype;
begin
  select * into v_delivery from public.delivery where id = p_delivery for update;
  if v_delivery.id is null then raise exception 'entrega inexistente'; end if;
  if not public.is_teacher_of_course(public.course_of_enrollment(v_delivery.owner_enrollment_id)) then
    raise exception 'no autorizado';
  end if;
  update public.delivery set state = 'in_progress', updated_at = now() where id = p_delivery;
end $$;

-- ── Permisos de ejecución ──────────────────────────────────────────────────
revoke all on function public.hash_code(text) from public;

do $$
declare f text;
begin
  foreach f in array array[
    'public.current_enrollment_id()',
    'public.course_of_enrollment(uuid)',
    'public.is_teacher_of_course(uuid)',
    'public.is_team_member_of_delivery(uuid, uuid)',
    'public.can_access_delivery(uuid)',
    'public.milestone_in_course(uuid, uuid)',
    'public.evidence_object_allowed(text, text, boolean)',
    'public.redeem_code(text, text)',
    'public.regenerate_code(uuid)',
    'public.revoke_session(uuid, text)',
    'public.start_delivery(uuid)',
    'public.submit_evidence(uuid, uuid, text, text, text)',
    'public.register_equivalent_evidence(uuid, uuid, text, text, text)',
    'public.validate_milestone(uuid, jsonb, text)',
    'public.correct_assessment(uuid, text, text)',
    'public.revoke_xp(uuid, text)',
    'public.reopen_milestone(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
