-- RED-TIC · I0b · Storage privado
-- Corrección 4: la autorización se amarra a filas reales (curso, entrega y matrícula),
-- no solo a la presencia de un enrollment_id en la ruta.
--
-- Ruta: course/{course_id}/enrollment/{enrollment_id}/delivery/{delivery_id}/{archivo}
-- Toda la lógica vive en public.evidence_object_allowed(bucket_id, name, write).
--
-- En producción, storage.objects pertenece al rol de Storage; si el rol de migración no
-- puede crear políticas, aplícalas con el rol propietario. En el entorno aislado funciona.

alter table storage.objects enable row level security;

-- En Supabase el rol authenticated ya tiene estos permisos; se declaran para el entorno aislado.
grant usage on schema storage to authenticated;
grant select, insert on storage.objects to authenticated;

drop policy if exists evidence_objects_select on storage.objects;
create policy evidence_objects_select on storage.objects
  for select to authenticated
  using (public.evidence_object_allowed(bucket_id, name, false));

drop policy if exists evidence_objects_insert on storage.objects;
create policy evidence_objects_insert on storage.objects
  for insert to authenticated
  with check (public.evidence_object_allowed(bucket_id, name, true));

-- Sin políticas de UPDATE/DELETE: los objetos son inmutables desde el cliente.
