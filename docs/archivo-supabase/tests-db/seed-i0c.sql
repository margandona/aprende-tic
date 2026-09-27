-- RED-TIC · I0c · Datos sintéticos adicionales SOLO para pruebas adversariales.
-- Un programa/hito ajeno para comprobar coherencia de curso y programa.

insert into public.program_version (id, label) values
  ('00000000-0000-0000-0000-000000000011', 'red-tic-2027.1 (ajeno, sintético)')
on conflict (id) do nothing;

insert into public.xp_rule (id, program_version_id, action, xp_value) values
  ('70000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000011', 'ajeno', 10)
on conflict (id) do nothing;

insert into public.mission (id, program_version_id, ord, name, prompt) values
  ('50000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000011', 1, 'Programa ajeno', 'Solo pruebas')
on conflict (id) do nothing;

insert into public.milestone (id, mission_id, ord, title, xp_rule_id) values
  ('60000000-0000-0000-0000-000000000099', '50000000-0000-0000-0000-000000000099', 1, 'Hito ajeno', '70000000-0000-0000-0000-000000000099')
on conflict (id) do nothing;
