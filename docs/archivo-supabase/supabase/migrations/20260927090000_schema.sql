-- RED-TIC · I0b · Esquema base (entorno de pruebas aislado)
-- Migración versionada. No contiene datos reales.
-- Nota: asume que Supabase provee los esquemas auth y storage.

-- ── Organización y programa ────────────────────────────────────────────────
create table if not exists public.institution (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active'
);

create table if not exists public.program_version (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  published_at timestamptz not null default now()
);

create table if not exists public.course (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institution(id) on delete cascade,
  name text not null,
  level text not null,
  year int not null,
  program_version_id uuid not null references public.program_version(id),
  status text not null default 'active'
);

-- ── Identidad ──────────────────────────────────────────────────────────────
-- Corrección 6: teacher.id (lógico) separado de teacher.auth_user_id (Supabase Auth),
-- con clave foránea a auth.users y unicidad.
create table if not exists public.teacher (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text not null,
  status text not null default 'active'
);

create table if not exists public.teacher_course (
  teacher_id uuid not null references public.teacher(id) on delete cascade,
  course_id uuid not null references public.course(id) on delete cascade,
  role text not null default 'facilitator',
  primary key (teacher_id, course_id)
);

create table if not exists public.student_enrollment (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.course(id) on delete cascade,
  pseudonym text not null,
  state text not null default 'active'
);

create table if not exists public.code_credential (
  id uuid primary key default gen_random_uuid(),
  student_enrollment_id uuid not null references public.student_enrollment(id) on delete cascade,
  code_hash text not null,
  state text not null default 'active' check (state in ('active','revoked')),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  failed_attempts int not null default 0,
  locked_until timestamptz
);

-- Corrección 5: búsqueda escalable por igualdad de hash (índice único).
create unique index if not exists code_credential_hash_key on public.code_credential (code_hash);

create table if not exists public.student_session_binding (
  id uuid primary key default gen_random_uuid(),
  auth_uid uuid not null,
  student_enrollment_id uuid not null references public.student_enrollment(id) on delete cascade,
  state text not null default 'active' check (state in ('active','revoked','expired')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text
);

-- Corrección 5: como máximo un binding activo por matrícula y por auth_uid.
create unique index if not exists binding_one_active_per_enrollment
  on public.student_session_binding (student_enrollment_id) where state = 'active';
create unique index if not exists binding_one_active_per_auth_uid
  on public.student_session_binding (auth_uid) where state = 'active';

-- Límite de intentos de canje (anti fuerza bruta).
create table if not exists public.redeem_attempt (
  id bigserial primary key,
  client_key text not null,
  attempted_at timestamptz not null default now(),
  success boolean not null default false
);
create index if not exists redeem_attempt_client_key_idx on public.redeem_attempt (client_key, attempted_at);

-- ── Itinerario y competencias ──────────────────────────────────────────────
create table if not exists public.mission (
  id uuid primary key default gen_random_uuid(),
  program_version_id uuid not null references public.program_version(id),
  ord int not null,
  name text not null,
  narrative text,
  prompt text,
  status text not null default 'active'
);

create table if not exists public.xp_rule (
  id uuid primary key default gen_random_uuid(),
  program_version_id uuid not null references public.program_version(id),
  action text not null,
  xp_value int not null
);

create table if not exists public.milestone (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.mission(id) on delete cascade,
  ord int not null,
  title text not null,
  deliverable_type text,
  xp_rule_id uuid references public.xp_rule(id)
);

create table if not exists public.indicator (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  axis text not null check (axis in ('D','E')),
  name text not null,
  descriptor text,
  criterion text
);

create table if not exists public.milestone_indicator (
  milestone_id uuid not null references public.milestone(id) on delete cascade,
  indicator_id uuid not null references public.indicator(id) on delete cascade,
  primary key (milestone_id, indicator_id)
);

create table if not exists public.reflection_prompt (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestone(id) on delete cascade,
  text text not null
);

-- ── Equipos y entregas ─────────────────────────────────────────────────────
create table if not exists public.team (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.course(id) on delete cascade,
  name text not null
);

create table if not exists public.team_member (
  team_id uuid not null references public.team(id) on delete cascade,
  student_enrollment_id uuid not null references public.student_enrollment(id) on delete cascade,
  role text,
  primary key (team_id, student_enrollment_id)
);

-- Corrección 7: un único propietario lógico (owner_enrollment_id) + scope/team_id.
-- Para entregas de equipo, el propietario es quien crea; los coautores se derivan de team_member.
create table if not exists public.delivery (
  id uuid primary key default gen_random_uuid(),
  owner_enrollment_id uuid not null references public.student_enrollment(id) on delete cascade,
  milestone_id uuid not null references public.milestone(id) on delete cascade,
  scope text not null default 'individual' check (scope in ('individual','team')),
  team_id uuid references public.team(id) on delete set null,
  state text not null default 'not_started'
    check (state in ('not_started','in_progress','pending_review','achieved')),
  current_evidence_id uuid,
  submit_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_enrollment_id, milestone_id)
);

create table if not exists public.evidence_version (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.delivery(id) on delete cascade,
  version int not null,
  origin text not null check (origin in ('student_digital','teacher_equivalent')),
  format text not null check (format in ('text','image','file','audio_local','paper','model','dictation','adaptation')),
  test_modality text not null default 'not_applicable'
    check (test_modality in ('not_applicable','peer_simulation','simulation','real_authorized')),
  text_content text,
  description text,
  submit_key uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (delivery_id, version)
);
create unique index if not exists evidence_submit_key_key
  on public.evidence_version (delivery_id, submit_key) where submit_key is not null;

alter table public.delivery
  drop constraint if exists delivery_current_evidence_fk;
alter table public.delivery
  add constraint delivery_current_evidence_fk
  foreign key (current_evidence_id) references public.evidence_version(id);

create table if not exists public.evidence_file (
  id uuid primary key default gen_random_uuid(),
  evidence_version_id uuid not null references public.evidence_version(id) on delete cascade,
  storage_path text not null,
  mime text,
  size_bytes int,
  sha256 text
);

create table if not exists public.evidence_contributor (
  evidence_version_id uuid not null references public.evidence_version(id) on delete cascade,
  student_enrollment_id uuid not null references public.student_enrollment(id) on delete cascade,
  contribution_note text,
  primary key (evidence_version_id, student_enrollment_id)
);

create table if not exists public.reflection (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.delivery(id) on delete cascade,
  text text,
  created_at timestamptz not null default now()
);

-- ── Evaluación y gamificación ──────────────────────────────────────────────
create table if not exists public.assessment (
  id uuid primary key default gen_random_uuid(),
  student_enrollment_id uuid not null references public.student_enrollment(id) on delete cascade,
  indicator_id uuid not null references public.indicator(id) on delete cascade,
  milestone_id uuid not null references public.milestone(id) on delete cascade,
  level text not null check (level in ('not_evaluated','incipient','developing','achieved','transferable')),
  comment text,
  evidence_version_id uuid references public.evidence_version(id),
  validated_by uuid,
  validated_at timestamptz not null default now(),
  unique (student_enrollment_id, indicator_id, milestone_id)
);

create table if not exists public.assessment_history (
  id bigserial primary key,
  assessment_id uuid not null references public.assessment(id) on delete cascade,
  previous_level text,
  new_level text,
  comment text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

-- Idempotencia de XP: una sola fila por (matrícula, hito, versión de programa).
create table if not exists public.xp_event (
  id uuid primary key default gen_random_uuid(),
  student_enrollment_id uuid not null references public.student_enrollment(id) on delete cascade,
  milestone_id uuid not null references public.milestone(id) on delete cascade,
  program_version_id uuid not null references public.program_version(id),
  xp_value int not null default 0,
  xp_rule_id uuid references public.xp_rule(id),
  validated_by uuid,
  validated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text,
  unique (student_enrollment_id, milestone_id, program_version_id)
);

create table if not exists public.badge (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  criterion text
);

create table if not exists public.badge_award (
  id uuid primary key default gen_random_uuid(),
  student_enrollment_id uuid not null references public.student_enrollment(id) on delete cascade,
  badge_id uuid not null references public.badge(id) on delete cascade,
  evidence_version_id uuid references public.evidence_version(id),
  validated_by uuid,
  awarded_at timestamptz not null default now(),
  unique (student_enrollment_id, badge_id)
);

-- ── Diagnóstico / postest ──────────────────────────────────────────────────
create table if not exists public.diagnosis_version (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  case_ref text
);

create table if not exists public.diagnosis_attempt (
  id uuid primary key default gen_random_uuid(),
  student_enrollment_id uuid not null references public.student_enrollment(id) on delete cascade,
  kind text not null check (kind in ('pre','post')),
  diagnosis_version_id uuid references public.diagnosis_version(id),
  modality text not null default 'digital' check (modality in ('digital','paper','audio')),
  status text not null default 'draft' check (status in ('draft','submitted','reviewed')),
  submitted_at timestamptz
);

-- Corrección P1: response_status, score nullable y technical_issue independientes.
create table if not exists public.diagnosis_response (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.diagnosis_attempt(id) on delete cascade,
  task_code text not null,
  response_status text not null check (response_status in ('answered','not_answered','skipped')),
  score int check (score is null or score between 0 and 2),
  technical_issue boolean not null default false,
  reviewer_comment text
);

-- Apoyos como filas independientes (no excluyentes con la puntuación).
create table if not exists public.diagnosis_response_support (
  response_id uuid not null references public.diagnosis_response(id) on delete cascade,
  support_code text not null,
  primary key (response_id, support_code)
);

create table if not exists public.conditions_survey (
  id uuid primary key default gen_random_uuid(),
  student_enrollment_id uuid not null references public.student_enrollment(id) on delete cascade,
  answers_json jsonb,
  submitted_at timestamptz not null default now()
);

-- ── Publicación, auditoría y retención ─────────────────────────────────────
create table if not exists public.publication_review (
  id uuid primary key default gen_random_uuid(),
  evidence_version_id uuid not null references public.evidence_version(id) on delete cascade,
  reviewer_id uuid,
  checks_json jsonb,
  decision text,
  decided_at timestamptz
);

create table if not exists public.audit_log (
  id bigserial primary key,
  actor_id uuid,
  actor_role text,
  action text not null,
  entity text,
  entity_id uuid,
  meta jsonb,
  at timestamptz not null default now()
);

create table if not exists public.retention_policy (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references public.institution(id) on delete cascade,
  entity text not null,
  retention_days int not null,
  action text not null check (action in ('anonymize','delete'))
);
