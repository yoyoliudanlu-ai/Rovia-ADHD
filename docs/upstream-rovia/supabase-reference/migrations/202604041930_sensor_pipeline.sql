alter table public.telemetry_data
  add column if not exists distance_meters double precision,
  add column if not exists wearable_rssi integer,
  add column if not exists squeeze_pressure double precision,
  add column if not exists squeeze_level text,
  add column if not exists source_device text;

alter publication supabase_realtime add table public.telemetry_data;
