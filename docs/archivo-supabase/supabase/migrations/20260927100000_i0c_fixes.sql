-- RED-TIC · I0c · Corrección de los siete bloqueantes de la revisión de I0b.
-- Migración NUEVA: no reescribe las migraciones publicadas.
-- Datos sintéticos; ningún secreto real.

-- Las firmas cambian (renombre de parámetro / parámetro nuevo): se eliminan las versiones publicadas
-- para evitar sobrecargas ambiguas. Las políticas no dependen de estas funciones.
drop function if exists public.redeem_code(text, text);
drop function if exists public.register_equivalent_evidence(uuid, uuid, text, text, text);

-- ═══════════════════════════════════════════════════════════════════════════
-- B2 · Hash con pimiento (pepper) y códigos de alta entropía / caducidad
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.security_pepper (
  id boolean primary key default true check (id),
  value text not null
);
-- Pimiento sintético para pruebas. En producción se define desde un secreto del servidor.
insert into public.security_pepper (id, value)
values (true, 'synthetic-pepper-' || gen_random_uuid()::text)
on conflict (id) do nothing;
alter table public.security_pepper enable row level security;
-- Sin políticas ni grants: solo el propietario (funciones SECURITY DEFINER).

alter table public.code_credential add column if not exists expires_at timestamptz;
alter table public.code_credential add column if not exists last_failed_at timestamptz;

-- Hash determinista con pimiento secreto: conserva el índice y evita fuerza bruta sin el pimiento.
create or replace function public.hash_code(p_code text)
returns text language sql stable security definer set search_path = public as $$
  select encode(
    sha256(convert_to(
      (select value from public.security_pepper where id) || ':' || upper(btrim(p_code)) || ':' ||
      (select value from public.security_pepper where id),
      'UTF8'
    )),
    'hex'
  )
$$;
revoke all on function public.hash_code(text) from public;

-- ═══════════════════════════════════════════════════════════════════════════
-- B1 · Limitación de intentos en borde + bloqueo por credencial + serialización
-- ═══════════════════════════════════════════════════════════════════════════
-- `p_actor_key` DEBE provenir de un borde confiable (servidor/Edge Function), nunca del cliente.
-- La base añade además: bloqueo por credencial y límite global por ventana.
create or replace function public.redeem_code(p_code text, p_actor_key text default 'server')
returns table (status text, pseudonym text, expires_at timestamptz)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_hash text := public.hash_code(p_code);
  v_cred public.code_credential%rowtype;
  v_expires timestamptz := now() + interval '12 hours';
  v_actor_failures int;
  v_global_failures int;
begin
  if auth.uid() is null then
    return query select 'no_session'::text, null::text, null::timestamptz;
    return;
  end if;

  -- Serializa los intentos del mismo código entre conexiones (evita contar de menos).
  perform pg_advisory_xact_lock(hashtextextended(v_hash, 0));

  -- Límite global por ventana (no evadible rotando claves de actor).
  select count(*) into v_global_failures
  from public.redeem_attempt
  where success = false and attempted_at > now() - interval '1 minute';
  if v_global_failures >= 120 then
    return query select 'rate_limited'::text, null::text, null::timestamptz;
    return;
  end if;

  -- Límite por actor (clave del borde confiable).
  select count(*) into v_actor_failures
  from public.redeem_attempt
  where p_actor_key = p_actor_key
    and client_key = p_actor_key
    and success = false
    and attempted_at > now() - interval '10 minutes';
  if v_actor_failures >= 10 then
    return query select 'rate_limited'::text, null::text, null::timestamptz;
    return;
  end if;

  select * into v_cred
  from public.code_credential
  where code_hash = v_hash
  for update;

  if v_cred.id is null then
    insert into public.redeem_attempt (client_key, success) values (p_actor_key, false);
    return query select 'invalid'::text, null::text, null::timestamptz;
    return;
  end if;

  -- Bloqueo por credencial (no evadible rotando la clave de actor).
  if v_cred.locked_until is not null and v_cred.locked_until > now() then
    update public.code_credential
       set failed_attempts = failed_attempts + 1, last_failed_at = now()
     where id = v_cred.id;
    insert into public.redeem_attempt (client_key, success) values (p_actor_key, false);
    return query select 'locked'::text, null::text, null::timestamptz;
    return;
  end if;
  if v_cred.failed_attempts >= 10 then
    update public.code_credential
       set failed_attempts = failed_attempts + 1, last_failed_at = now(),
           locked_until = now() + interval '15 minutes'
     where id = v_cred.id;
    insert into public.redeem_attempt (client_key, success) values (p_actor_key, false);
    return query select 'locked'::text, null::text, null::timestamptz;
    return;
  end if;

  if v_cred.expires_at is not null and v_cred.expires_at <= now() then
    update public.code_credential
       set failed_attempts = failed_attempts + 1, last_failed_at = now()
     where id = v_cred.id;
    insert into public.redeem_attempt (client_key, success) values (p_actor_key, false);
    return query select 'expired'::text, null::text, null::timestamptz;
    return;
  end if;

  if v_cred.state <> 'active' then
    update public.code_credential
       set failed_attempts = failed_attempts + 1, last_failed_at = now()
     where id = v_cred.id;
    insert into public.redeem_attempt (client_key, success) values (p_actor_key, false);
    return query select 'revoked'::text, null::text, null::timestamptz;
    return;
  end if;

  update public.student_session_binding
     set state = 'revoked', revoked_at = now(), revoked_reason = 'nuevo canje'
   where state = 'active'
     and (student_enrollment_id = v_cred.student_enrollment_id or auth_uid = auth.uid());

  insert into public.student_session_binding (auth_uid, student_enrollment_id, state, issued_at, expires_at)
  values (auth.uid(), v_cred.student_enrollment_id, 'active', now(), v_expires);

  update public.code_credential
     set last_used_at = now(), failed_attempts = 0, locked_until = null
   where id = v_cred.id;

  insert into public.redeem_attempt (client_key, success) values (p_actor_key, true);

  return query
    select 'ok'::text, se.pseudonym, v_expires
    from public.student_enrollment se
    where se.id = v_cred.student_enrollment_id;
end $$;

-- Códigos de alta entropía (24 hex ≈ 96 bits) y caducidad.
create or replace function public.regenerate_code(p_enrollment uuid)
returns text
language plpgsql security definer set search_path = public, auth as $$
declare
  v_course uuid := public.course_of_enrollment(p_enrollment);
  v_plain text := upper(substr(
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 24));
begin
  if not public.is_teacher_of_course(v_course) then
    raise exception 'no autorizado';
  end if;

  update public.code_credential set state = 'revoked', revoked_at = now()
   where student_enrollment_id = p_enrollment and state = 'active';

  update public.student_session_binding
     set state = 'revoked', revoked_at = now(), revoked_reason = 'regeneración de código'
   where student_enrollment_id = p_enrollment and state = 'active';

  insert into public.code_credential (student_enrollment_id, code_hash, expires_at)
  values (p_enrollment, public.hash_code(v_plain), now() + interval '180 days');

  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id)
  values (auth.uid(), 'teacher', 'regenerate_code', 'student_enrollment', p_enrollment);

  return v_plain;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- B3 · register_equivalent_evidence: coherencia de curso, versión y estado
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.register_equivalent_evidence(
  p_enrollment uuid,
  p_milestone uuid,
  p_format text,
  p_description text,
  p_test_modality text default 'not_applicable',
  p_submit_key uuid default null
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_course uuid := public.course_of_enrollment(p_enrollment);
  v_delivery public.delivery%rowtype;
  v_last int;
  v_new uuid;
  v_existing uuid;
begin
  if not public.is_teacher_of_course(v_course) then raise exception 'no autorizado'; end if;

  if not public.milestone_in_course(p_milestone, v_course) then
    raise exception 'el hito no pertenece al programa del curso';
  end if;

  select * into v_delivery from public.delivery
   where owner_enrollment_id = p_enrollment and milestone_id = p_milestone
   for update;

  if v_delivery.id is null then
    insert into public.delivery (owner_enrollment_id, milestone_id, scope, state)
    values (p_enrollment, p_milestone, 'individual', 'pending_review')
    returning * into v_delivery;
  else
    if v_delivery.state = 'achieved' then
      raise exception 'la entrega ya está cerrada';
    end if;
  end if;

  if p_submit_key is not null then
    select id into v_existing from public.evidence_version
     where delivery_id = v_delivery.id and submit_key = p_submit_key;
    if v_existing is not null then return v_existing; end if;
  end if;

  select coalesce(max(version), 0) + 1 into v_last
  from public.evidence_version where delivery_id = v_delivery.id;

  insert into public.evidence_version
    (delivery_id, version, origin, format, test_modality, description, submit_key, created_by)
  values (v_delivery.id, v_last, 'teacher_equivalent', p_format, p_test_modality, p_description, p_submit_key, auth.uid())
  returning id into v_new;

  update public.delivery
     set current_evidence_id = v_new, state = 'pending_review', updated_at = now()
   where id = v_delivery.id;

  return v_new;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- B4 · Coherencia de curso/programa en delivery y team_member
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.check_delivery_coherence()
returns trigger language plpgsql set search_path = public as $$
declare v_course uuid;
begin
  v_course := public.course_of_enrollment(new.owner_enrollment_id);
  if v_course is null then
    raise exception 'matrícula inexistente';
  end if;
  if not public.milestone_in_course(new.milestone_id, v_course) then
    raise exception 'el hito no pertenece al programa del curso de la matrícula';
  end if;
  if new.team_id is not null then
    if (select course_id from public.team where id = new.team_id) <> v_course then
      raise exception 'el equipo no pertenece al curso de la matrícula';
    end if;
    if new.scope <> 'team' then
      raise exception 'un delivery con team_id debe tener scope=team';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_delivery_coherence on public.delivery;
create trigger trg_delivery_coherence
before insert or update on public.delivery
for each row execute function public.check_delivery_coherence();

create or replace function public.check_team_member_coherence()
returns trigger language plpgsql set search_path = public as $$
declare v_team_course uuid; v_member_course uuid;
begin
  v_team_course := (select course_id from public.team where id = new.team_id);
  v_member_course := public.course_of_enrollment(new.student_enrollment_id);
  if v_team_course is null or v_member_course is null or v_team_course <> v_member_course then
    raise exception 'el integrante no pertenece al curso del equipo';
  end if;
  return new;
end $$;

drop trigger if exists trg_team_member_coherence on public.team_member;
create trigger trg_team_member_coherence
before insert or update on public.team_member
for each row execute function public.check_team_member_coherence();

-- ═══════════════════════════════════════════════════════════════════════════
-- B5 · Reserva de archivos y Storage amarrado a la versión vigente
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.evidence_upload_reservation (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.delivery(id) on delete cascade,
  storage_path text not null unique,
  mime text not null,
  size_bytes int not null,
  reserved_by uuid,
  reserved_at timestamptz not null default now(),
  consumed_at timestamptz
);
alter table public.evidence_upload_reservation enable row level security;
create policy reservation_select_own on public.evidence_upload_reservation
  for select to authenticated
  using (exists (select 1 from public.delivery d
                 where d.id = evidence_upload_reservation.delivery_id
                   and public.can_access_delivery(d.id)));
grant select on public.evidence_upload_reservation to authenticated;

-- Reserva controlada: valida estado, tipo y tamaño, y construye la ruta.
create or replace function public.reserve_evidence_upload(
  p_delivery uuid, p_filename text, p_mime text, p_size int
) returns text
language plpgsql security definer set search_path = public, auth as $$
declare
  v_delivery public.delivery%rowtype;
  v_course uuid;
  v_reservation uuid;
  v_path text;
  v_allowed_mimes text[] := array['text/plain','application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
begin
  select * into v_delivery from public.delivery where id = p_delivery for update;
  if v_delivery.id is null then raise exception 'entrega inexistente'; end if;
  if v_delivery.owner_enrollment_id <> public.current_enrollment_id() then
    raise exception 'solo el propietario reserva archivos';
  end if;
  if v_delivery.state not in ('not_started','in_progress') then
    raise exception 'la entrega no admite archivos en su estado actual';
  end if;
  if p_mime <> all (v_allowed_mimes) then
    raise exception 'tipo de archivo no permitido: %', p_mime;
  end if;
  if p_size is null or p_size <= 0 or p_size > 5 * 1024 * 1024 then
    raise exception 'tamaño de archivo no permitido';
  end if;
  if p_filename is null or length(btrim(p_filename)) = 0 or position('/' in p_filename) > 0 then
    raise exception 'nombre de archivo inválido';
  end if;

  v_course := public.course_of_enrollment(v_delivery.owner_enrollment_id);

  v_reservation := gen_random_uuid();
  v_path := format('course/%s/enrollment/%s/delivery/%s/uploads/%s/%s',
                   v_course, v_delivery.owner_enrollment_id, p_delivery, v_reservation, p_filename);

  insert into public.evidence_upload_reservation (id, delivery_id, storage_path, mime, size_bytes, reserved_by)
  values (v_reservation, p_delivery, v_path, p_mime, p_size, auth.uid());

  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id)
  values (auth.uid(), 'student', 'reserve_evidence_upload', 'delivery', p_delivery);

  return v_path;
end $$;
revoke all on function public.reserve_evidence_upload(uuid, text, text, int) from public;
grant execute on function public.reserve_evidence_upload(uuid, text, text, int) to authenticated;

-- Autorización de Storage v2: ruta con reserva y estado de la entrega.
create or replace function public.evidence_object_allowed(p_bucket text, p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = public, auth as $$
declare
  a text[] := string_to_array(p_name, '/');
  v_delivery uuid;
begin
  if p_bucket <> 'evidence' then return false; end if;
  if a is null or array_length(a, 1) < 9 then return false; end if;
  if a[1] <> 'course' or a[3] <> 'enrollment' or a[5] <> 'delivery' or a[7] <> 'uploads' then return false; end if;

  begin
    v_delivery := a[6]::uuid;
  exception when others then
    return false;
  end;

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

  if p_write then
    -- Solo el propietario, con reserva vigente y entrega abierta.
    if a[4] <> public.current_enrollment_id()::text then return false; end if;
    if not exists (
      select 1 from public.delivery d
      where d.id = v_delivery and d.state in ('not_started','in_progress')
    ) then
      return false;
    end if;
    return exists (
      select 1 from public.evidence_upload_reservation r
      where r.storage_path = p_name and r.consumed_at is null and r.delivery_id = v_delivery
    );
  end if;

  return true;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- B6 · validate_milestone: estado, evidencia vigente y validación completa
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_required uuid[];
  v_row record;
begin
  select * into v_delivery from public.delivery where id = p_delivery for update;
  if v_delivery.id is null then raise exception 'entrega inexistente'; end if;

  v_course := public.course_of_enrollment(v_delivery.owner_enrollment_id);
  if not public.is_teacher_of_course(v_course) then raise exception 'no autorizado'; end if;

  if v_delivery.state <> 'pending_review' then
    raise exception 'la entrega no está en estado «por revisar»';
  end if;

  if v_delivery.current_evidence_id is null then
    raise exception 'la entrega no tiene evidencia vigente';
  end if;

  -- La evidencia vigente debe pertenecer a la entrega, no estar eliminada y ser la última versión.
  if not exists (
    select 1 from public.evidence_version ev
    where ev.id = v_delivery.current_evidence_id
      and ev.delivery_id = v_delivery.id
      and ev.deleted_at is null
  ) then
    raise exception 'la evidencia vigente no pertenece a la entrega';
  end if;
  if (select max(version) from public.evidence_version where delivery_id = v_delivery.id and deleted_at is null)
     <> (select version from public.evidence_version where id = v_delivery.current_evidence_id) then
    raise exception 'la evidencia referida no es la versión vigente';
  end if;

  if p_assessments is null or jsonb_array_length(p_assessments) = 0 then
    raise exception 'se requiere al menos una valoración';
  end if;

  select array_agg(indicator_id) into v_required
  from public.milestone_indicator where milestone_id = v_delivery.milestone_id;

  -- Completitud por integrante y sin duplicados.
  for v_row in
    select coalesce((e->>'enrollment_id')::uuid, v_delivery.owner_enrollment_id) as enr,
           array_agg((e->>'indicator_id')::uuid) as inds
    from jsonb_array_elements(p_assessments) e
    group by 1
  loop
    if v_row.enr <> v_delivery.owner_enrollment_id
       and not public.is_team_member_of_delivery(p_delivery, v_row.enr) then
      raise exception 'la matrícula % no pertenece a la entrega', v_row.enr;
    end if;
    if array_length(v_row.inds, 1) <> (select count(distinct x) from unnest(v_row.inds) x) then
      raise exception 'indicador duplicado en la valoración';
    end if;
    if v_required is not null and exists (
      select 1 from unnest(v_required) r where not (r = any (v_row.inds))
    ) then
      raise exception 'faltan indicadores del hito en la valoración';
    end if;
  end loop;

  -- En entregas de equipo se exige valorar a todos los integrantes.
  if v_delivery.scope = 'team' then
    if exists (
      select 1 from public.team_member tm
      where tm.team_id = v_delivery.team_id
        and tm.student_enrollment_id not in (
          select coalesce((e->>'enrollment_id')::uuid, v_delivery.owner_enrollment_id)
          from jsonb_array_elements(p_assessments) e
        )
    ) then
      raise exception 'faltan integrantes del equipo en la valoración';
    end if;
  end if;

  select mi.program_version_id into v_pv
  from public.milestone m join public.mission mi on mi.id = m.mission_id
  where m.id = v_delivery.milestone_id;

  for v_item in select * from jsonb_array_elements(p_assessments) loop
    v_enrollment := coalesce((v_item->>'enrollment_id')::uuid, v_delivery.owner_enrollment_id);
    v_indicator := (v_item->>'indicator_id')::uuid;
    v_level := v_item->>'level';

    if v_level not in ('incipient','developing','achieved','transferable') then
      raise exception 'nivel inválido: %', v_level;
    end if;
    if not exists (
      select 1 from public.milestone_indicator mi
      where mi.milestone_id = v_delivery.milestone_id and mi.indicator_id = v_indicator
    ) then
      raise exception 'el indicador % no corresponde al hito', v_indicator;
    end if;

    insert into public.assessment_history (assessment_id, previous_level, new_level, comment, changed_by)
    select a.id, a.level, v_level, coalesce(v_item->>'comment', p_comment), auth.uid()
    from public.assessment a
    where a.student_enrollment_id = v_enrollment and a.indicator_id = v_indicator
      and a.milestone_id = v_delivery.milestone_id and a.level <> v_level;

    insert into public.assessment
      (student_enrollment_id, indicator_id, milestone_id, level, comment, evidence_version_id, validated_by, validated_at)
    values
      (v_enrollment, v_indicator, v_delivery.milestone_id, v_level,
       coalesce(v_item->>'comment', p_comment), v_delivery.current_evidence_id, auth.uid(), now())
    on conflict (student_enrollment_id, indicator_id, milestone_id)
    do update set level = excluded.level, comment = excluded.comment,
                  evidence_version_id = excluded.evidence_version_id,
                  validated_by = excluded.validated_by, validated_at = now();

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

-- ═══════════════════════════════════════════════════════════════════════════
-- B7 · Diagnóstico inmutable tras el envío
-- ═══════════════════════════════════════════════════════════════════════════
-- Se elimina la actualización directa; el envío pasa por una función controlada.
drop policy if exists diagnosis_attempt_update_own on public.diagnosis_attempt;
revoke update on public.diagnosis_attempt from authenticated;

create or replace function public.submit_diagnosis_attempt(p_attempt uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v public.diagnosis_attempt%rowtype;
begin
  select * into v from public.diagnosis_attempt where id = p_attempt for update;
  if v.id is null then raise exception 'intento inexistente'; end if;
  if v.student_enrollment_id <> public.current_enrollment_id() then raise exception 'no autorizado'; end if;
  if v.status <> 'draft' then raise exception 'el intento ya fue enviado'; end if;
  update public.diagnosis_attempt set status = 'submitted', submitted_at = now() where id = p_attempt;
end $$;
revoke all on function public.submit_diagnosis_attempt(uuid) from public;
grant execute on function public.submit_diagnosis_attempt(uuid) to authenticated;

-- Respuestas y apoyos solo mientras el intento está en borrador.
drop policy if exists diagnosis_response_insert_own on public.diagnosis_response;
create policy diagnosis_response_insert_own on public.diagnosis_response
  for insert to authenticated
  with check (exists (select 1 from public.diagnosis_attempt a
                      where a.id = diagnosis_response.attempt_id
                        and a.student_enrollment_id = public.current_enrollment_id()
                        and a.status = 'draft'));

drop policy if exists diagnosis_support_insert_own on public.diagnosis_response_support;
create policy diagnosis_support_insert_own on public.diagnosis_response_support
  for insert to authenticated
  with check (exists (select 1 from public.diagnosis_response r
                      join public.diagnosis_attempt a on a.id = r.attempt_id
                      where r.id = diagnosis_response_support.response_id
                        and a.student_enrollment_id = public.current_enrollment_id()
                        and a.status = 'draft'));

-- ── Permisos de ejecución de las funciones redefinidas ─────────────────────
revoke all on function public.redeem_code(text, text) from public;
grant execute on function public.redeem_code(text, text) to authenticated;
revoke all on function public.register_equivalent_evidence(uuid, uuid, text, text, text, uuid) from public;
grant execute on function public.register_equivalent_evidence(uuid, uuid, text, text, text, uuid) to authenticated;
