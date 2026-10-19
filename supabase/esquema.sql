-- BIPA Despacho: base de datos (Supabase / Postgres)
-- Todo cambio de estado pasa por funciones que validan quién lo hace y desde qué estado.

create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol text not null check (rol in ('comercial', 'planta', 'admin')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists public.pedidos (
  id bigint generated always as identity primary key,
  numero text not null,
  cliente text not null default '',
  estado text not null default 'por_revisar'
    check (estado in ('por_revisar', 'en_revision', 'en_espera', 'disponible', 'documento_listo', 'impreso', 'despachado', 'anulado')),
  cot_path text not null,
  tipo_doc text check (tipo_doc in ('nota', 'fiscal')),
  doc_numero text,
  doc_path text,
  tomado_por uuid references public.perfiles(id),
  nota_planta text,
  respuesta_comercial text,
  creado_por uuid references public.perfiles(id),
  creado_en timestamptz not null default now(),
  revisado_en timestamptz,
  disponible_en timestamptz,
  documento_en timestamptz,
  impreso_en timestamptz,
  despachado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  archivos_borrados boolean not null default false
);
create index if not exists pedidos_estado_idx on public.pedidos (estado);
create index if not exists pedidos_creado_idx on public.pedidos (creado_en desc);

create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references public.pedidos(id) on delete cascade,
  usuario uuid references public.perfiles(id),
  nombre text not null default '',
  accion text not null,
  detalle text,
  en timestamptz not null default now()
);
create index if not exists eventos_pedido_idx on public.eventos (pedido_id, en);

alter table public.perfiles enable row level security;
alter table public.pedidos enable row level security;
alter table public.eventos enable row level security;

-- Ayudantes
create or replace function public.mi_rol() returns text
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid() and activo
$$;

-- Lectura: cualquier persona activa ve todo (son pocos usuarios y todos trabajan el mismo flujo)
drop policy if exists perfiles_leer on public.perfiles;
create policy perfiles_leer on public.perfiles for select to authenticated using (public.mi_rol() is not null);
drop policy if exists pedidos_leer on public.pedidos;
create policy pedidos_leer on public.pedidos for select to authenticated using (public.mi_rol() is not null);
drop policy if exists eventos_leer on public.eventos;
create policy eventos_leer on public.eventos for select to authenticated using (public.mi_rol() is not null);
-- Sin políticas de insert/update/delete: solo por las funciones de abajo.

-- Lista de nombres para la pantalla de ingreso (solo nombre y correo interno)
create or replace function public.lista_ingreso()
returns table (nombre text, rol text, correo text)
language sql stable security definer set search_path = public, auth as $$
  select p.nombre, p.rol, u.email::text
  from perfiles p join auth.users u on u.id = p.id
  where p.activo
  order by case p.rol when 'planta' then 1 when 'comercial' then 2 else 3 end, p.nombre
$$;
grant execute on function public.lista_ingreso() to anon, authenticated;

create or replace function public._registrar(p_pedido bigint, p_accion text, p_detalle text)
returns void language sql security definer set search_path = public as $$
  insert into eventos (pedido_id, usuario, nombre, accion, detalle)
  values (p_pedido, auth.uid(), coalesce((select nombre from perfiles where id = auth.uid()), ''), p_accion, p_detalle)
$$;
revoke execute on function public._registrar(bigint, text, text) from public, anon, authenticated;

create or replace function public._exigir(p_roles text[]) returns text
language plpgsql stable security definer set search_path = public as $$
declare r text := public.mi_rol();
begin
  if r is null or not (r = any(p_roles) or r = 'admin') then
    raise exception 'No tienes permiso para esta acción';
  end if;
  return r;
end $$;
revoke execute on function public._exigir(text[]) from public, anon, authenticated;

create or replace function public._pedido(p_id bigint, p_estados text[]) returns public.pedidos
language plpgsql security definer set search_path = public as $$
declare p pedidos;
begin
  select * into p from pedidos where id = p_id for update;
  if not found then raise exception 'La cotización ya no existe'; end if;
  if not (p.estado = any(p_estados)) then
    raise exception 'Esta cotización ya cambió de estado (%). Actualiza la pantalla.', p.estado;
  end if;
  return p;
end $$;
revoke execute on function public._pedido(bigint, text[]) from public, anon, authenticated;

-- Comercial sube una cotización nueva
create or replace function public.crear_pedido(p_numero text, p_cliente text, p_cot_path text)
returns bigint language plpgsql security definer set search_path = public as $$
declare nid bigint;
begin
  perform _exigir(array['comercial']);
  insert into pedidos (numero, cliente, cot_path, creado_por)
  values (trim(p_numero), trim(coalesce(p_cliente, '')), p_cot_path, auth.uid())
  returning id into nid;
  perform _registrar(nid, 'Subió la cotización', null);
  return nid;
end $$;

-- Planta abre la cotización para revisarla (queda a su nombre)
create or replace function public.tomar_pedido(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare p pedidos;
begin
  perform _exigir(array['planta']);
  p := _pedido(p_id, array['por_revisar', 'en_revision']);
  if p.estado = 'en_revision' and p.tomado_por is distinct from auth.uid() then
    return; -- ya la está revisando otra persona; no se la quitamos
  end if;
  update pedidos set estado = 'en_revision', tomado_por = auth.uid(), actualizado_en = now() where id = p_id;
  if p.estado = 'por_revisar' then perform _registrar(p_id, 'Empezó a revisar en el depósito', null); end if;
end $$;

create or replace function public.confirmar_disponible(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare r text := _exigir(array['planta', 'comercial']);
begin
  perform _pedido(p_id, case when r = 'comercial' then array['en_espera', 'por_revisar', 'en_revision'] else array['por_revisar', 'en_revision', 'en_espera'] end);
  update pedidos set estado = 'disponible', revisado_en = coalesce(revisado_en, now()), disponible_en = now(), actualizado_en = now() where id = p_id;
  perform _registrar(p_id, case when r = 'comercial' then 'La pasó a facturar' else 'Confirmó: todo disponible' end, null);
end $$;

create or replace function public.reportar_novedad(p_id bigint, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(array['planta']);
  if coalesce(trim(p_nota), '') = '' then raise exception 'Escribe qué falta o qué cambiar'; end if;
  perform _pedido(p_id, array['por_revisar', 'en_revision', 'en_espera']);
  update pedidos set estado = 'en_espera', nota_planta = trim(p_nota), respuesta_comercial = null,
    revisado_en = coalesce(revisado_en, now()), actualizado_en = now() where id = p_id;
  perform _registrar(p_id, 'Reportó una novedad', trim(p_nota));
end $$;

-- Comercial responde una novedad; con cotización corregida o solo con un mensaje. Vuelve a revisión.
create or replace function public.responder_novedad(p_id bigint, p_texto text, p_cot_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(array['comercial']);
  perform _pedido(p_id, array['en_espera']);
  update pedidos set estado = 'por_revisar', respuesta_comercial = nullif(trim(coalesce(p_texto, '')), ''),
    cot_path = coalesce(p_cot_path, cot_path), actualizado_en = now() where id = p_id;
  perform _registrar(p_id, case when p_cot_path is null then 'Respondió la novedad' else 'Subió la cotización corregida' end, nullif(trim(coalesce(p_texto, '')), ''));
end $$;

-- Comercial adjunta la nota de entrega o la factura fiscal
create or replace function public.adjuntar_documento(p_id bigint, p_tipo text, p_numero text, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(array['comercial']);
  if p_tipo not in ('nota', 'fiscal') then raise exception 'Tipo de documento no válido'; end if;
  perform _pedido(p_id, array['disponible', 'documento_listo']);
  update pedidos set estado = 'documento_listo', tipo_doc = p_tipo, doc_numero = nullif(trim(coalesce(p_numero, '')), ''),
    doc_path = p_path, documento_en = now(), impreso_en = null, actualizado_en = now() where id = p_id;
  perform _registrar(p_id, case when p_tipo = 'nota' then 'Envió la nota de entrega a planta' else 'Imprimió la factura fiscal en Comercial' end, nullif(trim(coalesce(p_numero, '')), ''));
end $$;

create or replace function public.marcar_impreso(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare p pedidos;
begin
  perform _exigir(array['planta']);
  p := _pedido(p_id, array['documento_listo']);
  update pedidos set estado = 'impreso', impreso_en = now(), actualizado_en = now() where id = p_id;
  perform _registrar(p_id, case when p.tipo_doc = 'nota' then 'Imprimió la nota de entrega en planta' else 'Recibió la factura fiscal' end, null);
end $$;

-- Para reimprimir sin cambiar el estado, solo deja constancia
create or replace function public.registrar_reimpresion(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(array['planta']);
  perform _registrar(p_id, 'Reimprimió el documento', null);
end $$;

create or replace function public.marcar_despachado(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(array['planta']);
  perform _pedido(p_id, array['documento_listo', 'impreso']);
  update pedidos set estado = 'despachado', impreso_en = coalesce(impreso_en, now()), despachado_en = now(), actualizado_en = now() where id = p_id;
  perform _registrar(p_id, 'Despachó el pedido', null);
end $$;

create or replace function public.anular_pedido(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(array['comercial']);
  perform _pedido(p_id, array['por_revisar', 'en_revision', 'en_espera', 'disponible', 'documento_listo', 'impreso']);
  update pedidos set estado = 'anulado', actualizado_en = now() where id = p_id;
  perform _registrar(p_id, 'Anuló la cotización', nullif(trim(coalesce(p_motivo, '')), ''));
end $$;

-- Limpieza: devuelve los PDF de pedidos cerrados hace más de 15 días para borrarlos.
-- El historial (fechas, notas, quién hizo qué) se queda para siempre; pesa muy poco.
create or replace function public.archivos_para_limpiar()
returns table (id bigint, cot_path text, doc_path text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform _exigir(array['comercial']);
  return query
    with u as (
      update pedidos p set archivos_borrados = true
      where p.estado in ('despachado', 'anulado') and not p.archivos_borrados
        and p.actualizado_en < now() - interval '15 days'
      returning p.id, p.cot_path, p.doc_path
    ) select u.id, u.cot_path, u.doc_path from u;
end $$;

grant execute on function public.crear_pedido(text, text, text), public.tomar_pedido(bigint), public.confirmar_disponible(bigint),
  public.reportar_novedad(bigint, text), public.responder_novedad(bigint, text, text), public.adjuntar_documento(bigint, text, text, text),
  public.marcar_impreso(bigint), public.registrar_reimpresion(bigint), public.marcar_despachado(bigint), public.anular_pedido(bigint, text),
  public.archivos_para_limpiar() to authenticated;
revoke execute on function public.crear_pedido(text, text, text), public.tomar_pedido(bigint), public.confirmar_disponible(bigint),
  public.reportar_novedad(bigint, text), public.responder_novedad(bigint, text, text), public.adjuntar_documento(bigint, text, text, text),
  public.marcar_impreso(bigint), public.registrar_reimpresion(bigint), public.marcar_despachado(bigint), public.anular_pedido(bigint, text),
  public.archivos_para_limpiar() from public, anon;

-- Primer administrador: solo si no hay nadie, con candado para que no se creen dos a la vez.
-- La llama la función «usuarios» (con su llave de servicio), nunca la app.
create or replace function public._primer_admin(p_id uuid, p_nombre text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('bipa_primer_admin'));
  if exists (select 1 from perfiles) then return false; end if;
  insert into perfiles (id, nombre, rol) values (p_id, p_nombre, 'admin');
  return true;
end $$;
revoke execute on function public._primer_admin(uuid, text) from public, anon, authenticated;
grant execute on function public._primer_admin(uuid, text) to service_role;

-- Ajustes privados (código de alta del primer administrador). Solo la función usuarios los lee.
create table if not exists public._ajustes (clave text primary key, valor text not null);
alter table public._ajustes enable row level security;
revoke all on public._ajustes from public, anon, authenticated;
grant all on public._ajustes to service_role;

-- Tiempo real
do $$ begin
  begin alter publication supabase_realtime add table public.pedidos; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.eventos; exception when duplicate_object then null; end;
end $$;

-- Archivos (PDF): carpeta privada; ver = cualquier persona activa; subir y borrar = Comercial
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists documentos_leer on storage.objects;
create policy documentos_leer on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.mi_rol() is not null);
drop policy if exists documentos_subir on storage.objects;
create policy documentos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.mi_rol() in ('comercial', 'admin'));
drop policy if exists documentos_borrar on storage.objects;
create policy documentos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and public.mi_rol() in ('comercial', 'admin'));
