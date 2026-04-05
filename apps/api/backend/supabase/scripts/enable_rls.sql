-- Enable RLS and user-isolated policies for ADHD Companion tables.

alter table public.telemetry_data enable row level security;
alter table public.todos enable row level security;
alter table public.focus_sessions enable row level security;

drop policy if exists telemetry_data_user_select on public.telemetry_data;
drop policy if exists telemetry_data_user_insert on public.telemetry_data;
drop policy if exists telemetry_data_user_update on public.telemetry_data;
drop policy if exists telemetry_data_user_delete on public.telemetry_data;

create policy telemetry_data_user_select
on public.telemetry_data
for select
using (auth.uid() = user_id);

create policy telemetry_data_user_insert
on public.telemetry_data
for insert
with check (auth.uid() = user_id);

create policy telemetry_data_user_update
on public.telemetry_data
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy telemetry_data_user_delete
on public.telemetry_data
for delete
using (auth.uid() = user_id);

drop policy if exists todos_user_select on public.todos;
drop policy if exists todos_user_insert on public.todos;
drop policy if exists todos_user_update on public.todos;
drop policy if exists todos_user_delete on public.todos;

create policy todos_user_select
on public.todos
for select
using (auth.uid() = user_id);

create policy todos_user_insert
on public.todos
for insert
with check (auth.uid() = user_id);

create policy todos_user_update
on public.todos
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy todos_user_delete
on public.todos
for delete
using (auth.uid() = user_id);

drop policy if exists focus_sessions_user_select on public.focus_sessions;
drop policy if exists focus_sessions_user_insert on public.focus_sessions;
drop policy if exists focus_sessions_user_update on public.focus_sessions;
drop policy if exists focus_sessions_user_delete on public.focus_sessions;

create policy focus_sessions_user_select
on public.focus_sessions
for select
using (auth.uid() = user_id);

create policy focus_sessions_user_insert
on public.focus_sessions
for insert
with check (auth.uid() = user_id);

create policy focus_sessions_user_update
on public.focus_sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy focus_sessions_user_delete
on public.focus_sessions
for delete
using (auth.uid() = user_id);

