-- Extend telemetry_data with columns that exist in gateway code but were
-- missing from the initial Supabase schema snapshot.

alter table public.telemetry_data
    add column if not exists squeeze_pressure float8,
    add column if not exists focus_score      int4 check (focus_score between 0 and 100),
    add column if not exists source           text not null default 'desktop_gateway';
