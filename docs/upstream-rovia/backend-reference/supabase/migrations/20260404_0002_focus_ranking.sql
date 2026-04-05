-- Daily focus ranking across users

create or replace view public.focus_daily_ranking as
select
    date(fs.start_time) as day,
    fs.user_id,
    sum(
        case
            when fs.status = 'completed' then coalesce(fs.duration, 0)
            else 0
        end
    )::int as focus_minutes,
    count(*) filter (where fs.status = 'completed')::int as completed_sessions,
    round(avg(fs.focus_score)::numeric, 2) as avg_focus_score
from public.focus_sessions fs
group by date(fs.start_time), fs.user_id;

