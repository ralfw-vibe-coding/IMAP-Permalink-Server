create extension if not exists pgcrypto;
create extension if not exists pg_session_jwt;

create table if not exists public.profiles (
  id text primary key default auth.user_id(),
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  alter column created_at set default now(),
  alter column updated_at set default now();

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

alter table public.mailboxes
  alter column user_id set default auth.user_id(),
  alter column port set default 993,
  alter column secure set default true,
  alter column folder set default 'INBOX',
  alter column created_at set default now(),
  alter column updated_at set default now();

create table if not exists public.permalinks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default auth.user_id(),
  mailbox_id uuid not null references public.mailboxes (id) on delete cascade,
  thread_id text not null,
  token text not null unique,
  subject text not null,
  from_label text not null,
  to_label text not null default '',
  email_date timestamptz not null,
  snippet text not null default '',
  body text not null default '',
  has_pin boolean not null default false,
  pin_hash text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.permalinks
  add column if not exists to_label text not null default '',
  add column if not exists body text not null default '';

alter table public.permalinks
  alter column user_id set default auth.user_id(),
  alter column to_label set default '',
  alter column snippet set default '',
  alter column body set default '',
  alter column has_pin set default false,
  alter column created_at set default now();

create index if not exists mailboxes_user_id_idx on public.mailboxes (user_id);
create index if not exists permalinks_user_id_idx on public.permalinks (user_id);
create index if not exists permalinks_mailbox_id_idx on public.permalinks (mailbox_id);
create index if not exists permalinks_token_idx on public.permalinks (token);

drop function if exists public.get_permalink_access(text);

create or replace function public.get_permalink_access(permalink_token text)
returns table (
  mailbox_id uuid,
  thread_id text,
  subject text,
  from_label text,
  snapshot_to_label text,
  email_date timestamptz,
  snippet text,
  snapshot_body text,
  has_pin boolean,
  pin_hash text,
  expires_at timestamptz,
  host text,
  port integer,
  secure boolean,
  username text,
  encrypted_password text,
  folder text
)
language sql
security definer
set search_path = public
as $$
  select
    p.mailbox_id,
    p.thread_id,
    p.subject,
    p.from_label,
    p.to_label as snapshot_to_label,
    p.email_date,
    p.snippet,
    p.body as snapshot_body,
    p.has_pin,
    p.pin_hash,
    p.expires_at,
    m.host,
    m.port,
    m.secure,
    m.username,
    m.encrypted_password,
    m.folder
  from public.permalinks p
  join public.mailboxes m on m.id = p.mailbox_id
  where p.token = permalink_token
  limit 1;
$$;

revoke all on function public.get_permalink_access(text) from public;
grant execute on function public.get_permalink_access(text) to anonymous;
grant execute on function public.get_permalink_access(text) to authenticated;

notify pgrst, 'reload schema';
