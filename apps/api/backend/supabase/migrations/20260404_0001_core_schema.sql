-- ADHD Companion core schema
-- Covers telemetry_data / todos / focus_sessions for multi-device sync.

create extension if not exists pgcrypto;

create table if not exists public.telemetry_data (
    id bigserial primary key,
    user_id uuid not null,
    hrv float8,
    stress_level int4 check (stress_level between 0 and 100),
    distance_meters float8,
    is_at_desk boolean not null default false,
    squeeze_pressure float8,
    bpm float8,
    focus_score int4 check (focus_score between 0 and 100),
    source text not null default 'desktop_gateway',
    created_at timestamptz not null default now()
);

alter table public.telemetry_data add column if not exists squeeze_pressure float8;
alter table public.telemetry_data add column if not exists bpm float8;
alter table public.telemetry_data add column if not exists focus_score int4;
alter table public.telemetry_data add column if not exists source text;
alter table public.telemetry_data add column if not exists created_at timestamptz default now();

create index if not exists telemetry_user_created_idx
    on public.telemetry_data (user_id, created_at desc);

create table if not exists public.todos (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    task_text text not null,
    is_completed boolean not null default false,
    priority int2 not null default 1 check (priority between 0 and 2),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists todos_user_priority_idx
    on public.todos (user_id, priority desc, created_at asc);

create table if not exists public.focus_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    start_time timestamptz not null default now(),
    end_time timestamptz,
    duration int4 not null default 25 check (duration > 0),
    status text not null default 'running'
        check (status in ('running', 'completed', 'canceled')),
    trigger_source text not null default 'wristband_button',
    focus_score int4 check (focus_score between 0 and 100),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.focus_sessions add column if not exists trigger_source text default 'wristband_button';
alter table public.focus_sessions add column if not exists focus_score int4;
alter table public.focus_sessions add column if not exists end_time timestamptz;
alter table public.focus_sessions add column if not exists created_at timestamptz default now();
alter table public.focus_sessions add column if not exists updated_at timestamptz default now();

create index if not exists focus_sessions_user_time_idx
    on public.focus_sessions (user_id, start_time desc);

