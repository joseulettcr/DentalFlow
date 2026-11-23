-- T-02 · Migración 1/5 — Extensiones, esquema privado y privilegios por defecto.
--
-- Contrato: spec.md §5 (modelo relacional) y §8 (RLS y permisos).
-- Esta migración no crea tablas. Se aplica sobre un proyecto Supabase Cloud nuevo.

-- btree_gist permite combinar igualdad (doctor_id, weekday) con rangos en restricciones
-- EXCLUDE USING gist. Se instala en el esquema "extensions", como recomienda Supabase.
create extension if not exists btree_gist with schema extensions;

-- Esquema "private": tokens, estado OAuth y límites de uso. NO debe aparecer en
-- "Exposed schemas" de la Data API (Dashboard > Settings > API). Solo el backend
-- (rol service_role) tiene acceso.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

-- Mínimo privilegio por defecto: los objetos que se creen en "public" a partir de ahora
-- no se conceden automáticamente a anon ni a authenticated. Cada acceso debe otorgarse
-- de forma explícita (ver migración 5).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- Función de apoyo para columnas updated_at. Vive en "private" para no exponerse como RPC.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;
