-- RED-TIC · I0b · RLS y permisos
-- Escrituras sensibles: solo mediante funciones SECURITY DEFINER.
-- El cliente (rol authenticated) recibe SELECT acotado y, en diagnóstico/encuesta, INSERT propio.

grant usage on schema public to authenticated;

-- ── Catálogo (lectura para el MVP) ─────────────────────────────────────────
alter table public.institution enable row level security;
alter table public.program_version enable row level security;
alter table public.course enable row level security;
alter table public.mission enable row level security;
alter table public.milestone enable row level security;
alter table public.indicator enable row level security;
alter table public.milestone_indicator enable row level security;
alter table public.xp_rule enable row level security;
alter table public.badge enable row level security;

create policy catalog_read_institution on public.institution for select to authenticated using (true);
create policy catalog_read_program on public.program_version for select to authenticated using (true);
create policy catalog_read_course on public.course for select to authenticated using (true);
create policy catalog_read_mission on public.mission for select to authenticated using (true);
create policy catalog_read_milestone on public.milestone for select to authenticated using (true);
create policy catalog_read_indicator on public.indicator for select to authenticated using (true);
create policy catalog_read_milestone_indicator on public.milestone_indicator for select to authenticated using (true);
create policy catalog_read_xp_rule on public.xp_rule for select to authenticated using (true);
create policy catalog_read_badge on public.badge for select to authenticated using (true);

grant select on public.institution, public.program_version, public.course, public.mission,
  public.milestone, public.indicator, public.milestone_indicator, public.xp_rule, public.badge
  to authenticated;

-- ── Identidad: sin acceso directo del cliente ──────────────────────────────
alter table public.teacher enable row level security;
alter table public.teacher_course enable row level security;
alter table public.code_credential enable row level security;
alter table public.student_session_binding enable row level security;
alter table public.redeem_attempt enable row level security;
alter table public.audit_log enable row level security;
alter table public.publication_review enable row level security;
alter table public.retention_policy enable row level security;
-- Sin políticas ni grants: acceso únicamente por funciones SECURITY DEFINER / service role.

-- ── Matrícula ──────────────────────────────────────────────────────────────
alter table public.student_enrollment enable row level security;
create policy enrollment_select_own on public.student_enrollment
  for select to authenticated
  using (id = public.current_enrollment_id());
create policy enrollment_select_teacher on public.student_enrollment
  for select to authenticated
  using (public.is_teacher_of_course(course_id));
grant select on public.student_enrollment to authenticated;

-- ── Entregas y evidencias (SELECT; escritura solo por función) ─────────────
alter table public.delivery enable row level security;
create policy delivery_select on public.delivery
  for select to authenticated
  using (public.can_access_delivery(id));
grant select on public.delivery to authenticated;

alter table public.evidence_version enable row level security;
create policy evidence_select on public.evidence_version
  for select to authenticated
  using (public.can_access_delivery(delivery_id));
grant select on public.evidence_version to authenticated;

alter table public.evidence_file enable row level security;
create policy evidence_file_select on public.evidence_file
  for select to authenticated
  using (exists (select 1 from public.evidence_version ev
                 where ev.id = evidence_file.evidence_version_id
                   and public.can_access_delivery(ev.delivery_id)));
grant select on public.evidence_file to authenticated;

alter table public.evidence_contributor enable row level security;
create policy evidence_contributor_select on public.evidence_contributor
  for select to authenticated
  using (exists (select 1 from public.evidence_version ev
                 where ev.id = evidence_contributor.evidence_version_id
                   and public.can_access_delivery(ev.delivery_id)));
grant select on public.evidence_contributor to authenticated;

alter table public.reflection enable row level security;
create policy reflection_select on public.reflection
  for select to authenticated
  using (public.can_access_delivery(delivery_id));
grant select on public.reflection to authenticated;

-- ── Evaluación y gamificación (SELECT; escritura solo por función) ─────────
alter table public.assessment enable row level security;
create policy assessment_select_own on public.assessment
  for select to authenticated
  using (student_enrollment_id = public.current_enrollment_id());
create policy assessment_select_teacher on public.assessment
  for select to authenticated
  using (public.is_teacher_of_course(public.course_of_enrollment(student_enrollment_id)));
grant select on public.assessment to authenticated;

alter table public.assessment_history enable row level security;
create policy assessment_history_select on public.assessment_history
  for select to authenticated
  using (exists (select 1 from public.assessment a
                 where a.id = assessment_history.assessment_id
                   and (a.student_enrollment_id = public.current_enrollment_id()
                        or public.is_teacher_of_course(public.course_of_enrollment(a.student_enrollment_id)))));
grant select on public.assessment_history to authenticated;

alter table public.xp_event enable row level security;
create policy xp_select_own on public.xp_event
  for select to authenticated
  using (student_enrollment_id = public.current_enrollment_id());
create policy xp_select_teacher on public.xp_event
  for select to authenticated
  using (public.is_teacher_of_course(public.course_of_enrollment(student_enrollment_id)));
grant select on public.xp_event to authenticated;

alter table public.badge_award enable row level security;
create policy badge_select_own on public.badge_award
  for select to authenticated
  using (student_enrollment_id = public.current_enrollment_id());
create policy badge_select_teacher on public.badge_award
  for select to authenticated
  using (public.is_teacher_of_course(public.course_of_enrollment(student_enrollment_id)));
grant select on public.badge_award to authenticated;

-- ── Diagnóstico / encuesta ─────────────────────────────────────────────────
alter table public.diagnosis_attempt enable row level security;
create policy diagnosis_attempt_select_own on public.diagnosis_attempt
  for select to authenticated
  using (student_enrollment_id = public.current_enrollment_id());
create policy diagnosis_attempt_select_teacher on public.diagnosis_attempt
  for select to authenticated
  using (public.is_teacher_of_course(public.course_of_enrollment(student_enrollment_id)));
create policy diagnosis_attempt_insert_own on public.diagnosis_attempt
  for insert to authenticated
  with check (student_enrollment_id = public.current_enrollment_id());
create policy diagnosis_attempt_update_own on public.diagnosis_attempt
  for update to authenticated
  using (student_enrollment_id = public.current_enrollment_id())
  with check (student_enrollment_id = public.current_enrollment_id());
grant select, insert, update on public.diagnosis_attempt to authenticated;

alter table public.diagnosis_response enable row level security;
create policy diagnosis_response_select_own on public.diagnosis_response
  for select to authenticated
  using (exists (select 1 from public.diagnosis_attempt a
                 where a.id = diagnosis_response.attempt_id
                   and a.student_enrollment_id = public.current_enrollment_id()));
create policy diagnosis_response_select_teacher on public.diagnosis_response
  for select to authenticated
  using (exists (select 1 from public.diagnosis_attempt a
                 where a.id = diagnosis_response.attempt_id
                   and public.is_teacher_of_course(public.course_of_enrollment(a.student_enrollment_id))));
create policy diagnosis_response_insert_own on public.diagnosis_response
  for insert to authenticated
  with check (exists (select 1 from public.diagnosis_attempt a
                      where a.id = diagnosis_response.attempt_id
                        and a.student_enrollment_id = public.current_enrollment_id()));
grant select, insert on public.diagnosis_response to authenticated;

alter table public.diagnosis_response_support enable row level security;
create policy diagnosis_support_select_own on public.diagnosis_response_support
  for select to authenticated
  using (exists (select 1 from public.diagnosis_response r
                 join public.diagnosis_attempt a on a.id = r.attempt_id
                 where r.id = diagnosis_response_support.response_id
                   and a.student_enrollment_id = public.current_enrollment_id()));
create policy diagnosis_support_select_teacher on public.diagnosis_response_support
  for select to authenticated
  using (exists (select 1 from public.diagnosis_response r
                 join public.diagnosis_attempt a on a.id = r.attempt_id
                 where r.id = diagnosis_response_support.response_id
                   and public.is_teacher_of_course(public.course_of_enrollment(a.student_enrollment_id))));
create policy diagnosis_support_insert_own on public.diagnosis_response_support
  for insert to authenticated
  with check (exists (select 1 from public.diagnosis_response r
                      join public.diagnosis_attempt a on a.id = r.attempt_id
                      where r.id = diagnosis_response_support.response_id
                        and a.student_enrollment_id = public.current_enrollment_id()));
grant select, insert on public.diagnosis_response_support to authenticated;

-- La encuesta de condiciones la lee solo el docente del curso.
alter table public.conditions_survey enable row level security;
create policy conditions_select_teacher on public.conditions_survey
  for select to authenticated
  using (public.is_teacher_of_course(public.course_of_enrollment(student_enrollment_id)));
create policy conditions_insert_own on public.conditions_survey
  for insert to authenticated
  with check (student_enrollment_id = public.current_enrollment_id());
grant select, insert on public.conditions_survey to authenticated;
