-- Un nuevo comienzo · cierre de la tabla app_state (correr UNA vez al reactivar el proyecto de Supabase)
--
-- Antes, la página leía y escribía la tabla directamente con la clave pública, y todas las visitantes
-- usaban la misma fila (id "sharon"): cualquiera podía ver o pisar las postulaciones de otra.
-- Desde el 24/10/2026 la página usa un código secreto (UUID al azar) por dispositivo y solo estas dos
-- funciones. Este script:
--   1. Saca todo acceso directo a la tabla para la clave pública (anon) y las cuentas (authenticated).
--   2. Crea leer_estado y guardar_estado, que solo funcionan con un UUID válido.
--   3. Mueve la fila "sharon" a un código secreto nuevo y lo muestra al final, para pasárselo a Sharon
--      como link: https://nuevo-comienzo-sharon.vercel.app/?codigo=<código>

begin;

alter table public.app_state enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'app_state' loop
    execute format('drop policy %I on public.app_state', p.policyname);
  end loop;
end $$;

revoke all on public.app_state from anon, authenticated;

create or replace function public.leer_estado(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select data from public.app_state where id::text = p_id::text;
$$;

create or replace function public.guardar_estado(p_id uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Datos inválidos';
  end if;
  if pg_column_size(p_data) > 500000 then
    raise exception 'Demasiados datos';
  end if;
  insert into public.app_state (id, data, updated_at)
  values (p_id::text, p_data, now())
  on conflict (id) do update set data = excluded.data, updated_at = now();
end;
$$;

revoke all on function public.leer_estado(uuid) from public;
revoke all on function public.guardar_estado(uuid, jsonb) from public;
grant execute on function public.leer_estado(uuid) to anon, authenticated;
grant execute on function public.guardar_estado(uuid, jsonb) to anon, authenticated;

-- Fila de Sharon → código secreto nuevo (solo devuelve el código, no los datos)
update public.app_state set id = gen_random_uuid()::text where id = 'sharon' returning id as codigo_de_sharon;

commit;

-- Comprobación: con la clave pública esto tiene que fallar con "permission denied":
--   GET https://ligeqnuxarcbuzjeofji.supabase.co/rest/v1/app_state?select=id
