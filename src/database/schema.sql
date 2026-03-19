create extension if not exists pgcrypto;
create extension if not exists pg_session_jwt;

create table if not exists public.profiles (
  id text primary key default auth.user_id(),
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mailboxes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default auth.user_id(),
  label text not null,
  host text not null,
  port integer not null default 993,
  secure boolean not null default true,
  username text not null,
  encrypted_password text not null,
  folder text not null default 'INBOX',
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mailboxes_user_id_idx on public.mailboxes (user_id);
