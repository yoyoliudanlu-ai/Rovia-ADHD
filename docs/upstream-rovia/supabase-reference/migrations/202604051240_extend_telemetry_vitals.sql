alter table public.telemetry_data
  add column if not exists heart_rate double precision,
  add column if not exists sdnn double precision,
  add column if not exists focus_score integer;
