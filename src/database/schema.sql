create extension if not exists pgcrypto;
create extension if not exists pg_session_jwt;

create table if not exists public.profiles (
  id text primary key default auth.user_id(),
  email text not null default '',
  full_name text not null,
  last_otp_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_otps (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  otp_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text not null default '',
  add column if not exists last_otp_at timestamptz,
  alter column email set default '',
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

create table if not exists public.imap_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default auth.user_id(),
  mailbox_id uuid references public.mailboxes (id) on delete cascade,
  type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint imap_jobs_status_check check (status in ('pending', 'processing', 'completed', 'failed')),
  constraint imap_jobs_type_check check (type in ('load_threads', 'create_permalink'))
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
create index if not exists auth_otps_email_idx on public.auth_otps (email);
create index if not exists auth_sessions_token_hash_idx on public.auth_sessions (token_hash);
create index if not exists auth_sessions_user_id_idx on public.auth_sessions (user_id);
create index if not exists imap_jobs_user_id_idx on public.imap_jobs (user_id);
create index if not exists imap_jobs_mailbox_id_idx on public.imap_jobs (mailbox_id);
create index if not exists imap_jobs_status_idx on public.imap_jobs (status);
