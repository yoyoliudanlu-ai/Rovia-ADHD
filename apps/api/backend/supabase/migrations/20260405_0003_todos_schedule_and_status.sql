-- Align todos table with desktop-pet scheduling/status schema.

create table if not exists public.todos (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    content text not null,
    start_time timestamptz,
    end_time timestamptz,
    status text not null default 'pending'
        check (status in ('pending', 'completed', 'archived')),
    created_at timestamptz not null default now()
);

alter table public.todos add column if not exists content text;
alter table public.todos add column if not exists start_time timestamptz;
alter table public.todos add column if not exists end_time timestamptz;
alter table public.todos add column if not exists status text default 'pending';
alter table public.todos add column if not exists created_at timestamptz default now();

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'todos'
          and column_name = 'task_text'
    ) then
        execute 'update public.todos set content = coalesce(content, task_text) where content is null';
    end if;
exception
    when undefined_column then
        null;
end $$;

create index if not exists todos_user_status_created_idx
    on public.todos (user_id, status, created_at desc);

do $$
begin
    alter publication supabase_realtime add table public.todos;
exception
    when duplicate_object then null;
    when undefined_object then null;
end $$;
