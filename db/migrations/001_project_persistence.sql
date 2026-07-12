create extension if not exists pgcrypto;

create table if not exists profiles (
  user_id text primary key,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  problem text not null default '',
  current_html text not null,
  current_config jsonb not null default '{}'::jsonb,
  conversation jsonb not null default '[]'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_owner_updated_idx on projects (owner_id, updated_at desc);
create unique index if not exists one_demo_project_idx on projects ((is_demo)) where is_demo;

create table if not exists project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  html text not null,
  config jsonb not null default '{}'::jsonb,
  conversation jsonb not null default '[]'::jsonb,
  edit_note text,
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);

create table if not exists share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  project_version_id uuid not null references project_versions(id) on delete cascade,
  token text not null unique check (char_length(token) >= 32),
  is_enabled boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists share_links_lookup_idx on share_links (token) where is_enabled;
