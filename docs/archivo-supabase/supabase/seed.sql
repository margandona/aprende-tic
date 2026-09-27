-- RED-TIC · I0b · Semilla 100 % sintética
-- 2 estudiantes del mismo curso (X), 1 de otro curso (Y) y 2 docentes con ámbitos distintos.
-- Ningún dato corresponde a personas ni establecimientos reales.

-- ── Organización y programa ────────────────────────────────────────────────
insert into public.institution (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Colegio Innovador del Futuro (ficticio)');

insert into public.program_version (id, label) values
  ('00000000-0000-0000-0000-000000000010', 'red-tic-2026.1');

insert into public.course (id, institution_id, name, level, year, program_version_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '1º Medio A', '1º medio', 2026, '00000000-0000-0000-0000-000000000010'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '1º Medio B', '1º medio', 2026, '00000000-0000-0000-0000-000000000010');

-- ── Docentes (2, ámbitos distintos) ────────────────────────────────────────
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'docente1@example.test'),
  ('a0000000-0000-0000-0000-000000000002', 'docente2@example.test');

insert into public.teacher (id, auth_user_id, display_name) values
  ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Docente Uno (ficticio)'),
  ('20000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Docente Dos (ficticio)');

insert into public.teacher_course (teacher_id, course_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'facilitator'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'facilitator');

-- ── Estudiantes (2 en curso X, 1 en curso Y) ───────────────────────────────
insert into public.student_enrollment (id, course_id, pseudonym) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Zorro-01'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Puma-02'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Condor-03');

insert into public.code_credential (student_enrollment_id, code_hash) values
  ('30000000-0000-0000-0000-000000000001', public.hash_code('ZORRO-01')),
  ('30000000-0000-0000-0000-000000000002', public.hash_code('PUMA-02')),
  ('30000000-0000-0000-0000-000000000003', public.hash_code('CONDOR-03'));

-- ── Indicadores ────────────────────────────────────────────────────────────
insert into public.indicator (id, code, axis, name, descriptor, criterion) values
  ('40000000-0000-0000-0000-000000000001', 'D1', 'D', 'Buscar y valorar información', 'Formula una búsqueda y compara fuentes.', 'Selecciona una fuente verificable y explica dos razones.'),
  ('40000000-0000-0000-0000-000000000002', 'D2', 'D', 'Organizar información y trabajar con otros', 'Ordena archivos y coedita.', 'Recupera la versión acordada e identifica su aporte.'),
  ('40000000-0000-0000-0000-000000000003', 'D3', 'D', 'Crear un recurso comprensible y accesible', 'Elabora una guía ajustada a su usuario.', 'El usuario completa el paso esencial.'),
  ('40000000-0000-0000-0000-000000000004', 'D4', 'D', 'Actuar con seguridad y respeto', 'Reconoce fraude y decide qué dato no compartir.', 'Justifica con una señal observable.'),
  ('40000000-0000-0000-0000-000000000005', 'D5', 'D', 'Resolver problemas con criterio tecnológico', 'Compara alternativas y verifica si usa IA.', 'Documenta un ajuste y verifica.'),
  ('40000000-0000-0000-0000-000000000006', 'E1', 'E', 'Detectar una oportunidad y escuchar', 'Describe una dificultad observada.', 'Presenta necesidad, usuario y contexto con evidencia.'),
  ('40000000-0000-0000-0000-000000000007', 'E2', 'E', 'Proponer valor y elegir una alternativa', 'Compara soluciones según criterios.', 'Justifica dos criterios.'),
  ('40000000-0000-0000-0000-000000000008', 'E3', 'E', 'Movilizar recursos y planificar', 'Define roles, recursos y plan.', 'El plan asigna responsables y un riesgo.'),
  ('40000000-0000-0000-0000-000000000009', 'E4', 'E', 'Probar, colaborar y mejorar', 'Prueba y modifica el prototipo.', 'Identifica un cambio comprobable.'),
  ('40000000-0000-0000-0000-000000000010', 'E5', 'E', 'Reflexionar y comunicar el valor creado', 'Explica qué aprendió y qué falta.', 'Distingue aporte, evidencia y limitación.');

-- ── Misiones, reglas de XP e hitos ─────────────────────────────────────────
insert into public.xp_rule (id, program_version_id, action, xp_value) values
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'diagnostico', 20),
  ('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', 'necesidad', 20),
  ('70000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010', 'alternativas', 20),
  ('70000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000010', 'prototipo', 20),
  ('70000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000010', 'prueba', 15),
  ('70000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000010', 'cierre', 25);

insert into public.mission (id, program_version_id, ord, name, prompt) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 1, 'Abrir el mapa', '¿Qué sabemos y qué necesitamos averiguar?'),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', 2, 'Escuchar la señal', '¿Qué problema merece una solución?'),
  ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010', 3, 'Elegir una ruta', '¿Qué propuesta ofrece valor?'),
  ('50000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000010', 4, 'Construir el primer puente', '¿Puede usarla otra persona?'),
  ('50000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000010', 5, 'Probar el puente', '¿Qué ocurre al probarla?'),
  ('50000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000010', 6, 'Compartir la ruta', '¿Qué aprendimos y qué valor creamos?');

insert into public.milestone (id, mission_id, ord, title, xp_rule_id) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1, 'Diagnóstico y pregunta inicial', '70000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 1, 'Ficha de necesidad y fuentes', '70000000-0000-0000-0000-000000000002'),
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', 1, 'Alternativas y plan', '70000000-0000-0000-0000-000000000003'),
  ('60000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', 1, 'Prototipo v1', '70000000-0000-0000-0000-000000000004'),
  ('60000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000005', 1, 'Prueba y versión 2', '70000000-0000-0000-0000-000000000005'),
  ('60000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000006', 1, 'Presentación y reflexión', '70000000-0000-0000-0000-000000000006');

insert into public.milestone_indicator (milestone_id, indicator_id) values
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004'),
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000006'),
  ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000006'),
  ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000007'),
  ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000008'),
  ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002'),
  ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000003'),
  ('60000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000005'),
  ('60000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000009'),
  ('60000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000010');

-- ── Equipo en curso X ──────────────────────────────────────────────────────
insert into public.team (id, course_id, name) values
  ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Equipo Zorro-Puma');

insert into public.team_member (team_id, student_enrollment_id, role) values
  ('80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'facilitación'),
  ('80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'diseño');

-- ── Insignias ──────────────────────────────────────────────────────────────
insert into public.badge (id, code, name, criterion) values
  ('90000000-0000-0000-0000-000000000001', 'escucha', 'Escucha activa', 'Diferencia necesidad expresada de suposición.'),
  ('90000000-0000-0000-0000-000000000002', 'fuente', 'Fuente contrastada', 'Justifica una fuente y señala algo por verificar.'),
  ('90000000-0000-0000-0000-000000000003', 'segura', 'Decisión segura', 'Reconoce un riesgo y retira una solicitud de dato.'),
  ('90000000-0000-0000-0000-000000000004', 'diseno', 'Diseño comprensible', 'Corrige una barrera de lenguaje o acceso.'),
  ('90000000-0000-0000-0000-000000000005', 'prueba', 'Aprender de la prueba', 'Documenta observación y cambio.'),
  ('90000000-0000-0000-0000-000000000006', 'reflexion', 'Reflexión útil', 'Nombra estrategia, evidencia y próxima mejora.');

-- ── Diagnóstico ────────────────────────────────────────────────────────────
insert into public.diagnosis_version (id, label) values
  ('b0000000-0000-0000-0000-000000000001', 'Diagnóstico inicial (sintético)');

-- ── Entregas de ejemplo (para probar aislamiento de lectura) ───────────────
insert into public.delivery (id, owner_enrollment_id, milestone_id, scope, team_id, state) values
  ('d0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'individual', null, 'achieved'),
  ('d0000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000001', 'individual', null, 'achieved'),
  ('d0000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'team', '80000000-0000-0000-0000-000000000001', 'pending_review');

insert into public.evidence_version (id, delivery_id, version, origin, format, test_modality, description, created_by) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1, 'student_digital', 'text', 'not_applicable', 'Diagnóstico de Zorro-01', '30000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 1, 'student_digital', 'text', 'not_applicable', 'Diagnóstico de Condor-03', '30000000-0000-0000-0000-000000000003'),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 1, 'student_digital', 'file', 'peer_simulation', 'Ficha de necesidad del equipo', '30000000-0000-0000-0000-000000000001');

update public.delivery set current_evidence_id = 'e0000000-0000-0000-0000-000000000001' where id = 'd0000000-0000-0000-0000-000000000001';
update public.delivery set current_evidence_id = 'e0000000-0000-0000-0000-000000000002' where id = 'd0000000-0000-0000-0000-000000000002';
update public.delivery set current_evidence_id = 'e0000000-0000-0000-0000-000000000003' where id = 'd0000000-0000-0000-0000-000000000003';

-- Contribución individual en la entrega de equipo.
insert into public.evidence_contributor (evidence_version_id, student_enrollment_id, contribution_note) values
  ('e0000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Redactó el problema.'),
  ('e0000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', 'Buscó y contrastó fuentes.');
