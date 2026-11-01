-- AROHA '26: apply event timings from the organisers' two PDF schedules.
-- Run this AFTER supabase/seed-events.sql has populated the 43 events.
-- Times are transcribed as printed in the PDFs, including unusual AM/PM labels.
-- The administrator can later revise any time or venue from Stage Control -> Manage Events.

with schedule(title, event_date, event_time, venue) as (
  values
    ('Debate', date '2026-11-05', '9:00 AM onwards', null),
    ('Quiz', date '2026-11-06', '9:00 AM onwards', null),

    ('Essay Writing Malayalam', date '2026-11-09', '9:00 AM – 10:00 AM', null),
    ('Essay Writing Tamil', date '2026-11-09', '9:00 AM – 10:00 AM', null),
    ('Essay Writing Hindi', date '2026-11-09', '9:00 AM – 10:00 AM', null),
    ('Clay Modeling', date '2026-11-09', '9:00 AM – 12:00 PM', null),
    ('Poetry Writing Malayalam', date '2026-11-09', '10:00 AM – 11:00 AM', null),
    ('Poetry Writing Tamil', date '2026-11-09', '10:00 AM – 11:00 AM', null),
    ('Poetry Writing Hindi', date '2026-11-09', '10:00 AM – 11:00 AM', null),
    ('Essay Writing English', date '2026-11-09', '11:10 AM – 12:10 PM', null),
    ('Short Story Hindi', date '2026-11-09', '11:10 AM – 12:10 PM', null),
    ('Short Story Tamil', date '2026-11-09', '11:10 AM – 12:10 PM', null),
    ('Short Story English', date '2026-11-09', '12:10 PM – 1:10 PM', null),
    ('Painting', date '2026-11-09', '12:10 PM – 2:10 PM', null),

    ('Short Story Malayalam', date '2026-11-10', '9:00 AM – 10:00 AM', null),
    ('Poetry Writing English', date '2026-11-10', '9:00 AM – 10:00 AM', null),
    ('Poster Making', date '2026-11-10', '9:00 AM – 11:30 AM', null),
    ('Cartooning', date '2026-11-10', '12:00 PM – 2:00 PM', null),

    ('Inauguration Ceremony', date '2026-11-12', '9:00 AM – 9:30 AM', 'Stage 1'),
    ('Recitation (Tamil)', date '2026-11-12', '9:30 AM – 9:45 AM', 'Stage 1'),
    ('Recitation (English)', date '2026-11-12', '9:45 AM – 10:20 AM', 'Stage 1'),
    ('Recitation (Urdu)', date '2026-11-12', '10:20 AM – 10:45 AM', 'Stage 1'),
    ('Bharathanatyam', date '2026-11-12', '10:45 AM – 12:30 PM', 'Stage 1'),
    ('Mime', date '2026-11-12', '12:30 PM – 12:50 PM', 'Stage 1'),
    ('Folk Dance', date '2026-11-12', '12:50 PM – 1:30 PM', 'Stage 1'),
    ('Katha Prasangam', date '2026-11-12', '2:00 PM – 3:20 PM', 'Stage 1'),
    ('Group Dance', date '2026-11-12', '3:20 PM – 3:50 PM', 'Stage 1'),

    ('Light Music', date '2026-11-12', '9:30 AM – 11:00 AM', 'Stage 2'),
    ('Mappilapattu', date '2026-11-12', '11:00 AM – 11:25 AM', 'Stage 2'),
    ('Classical Music', date '2026-11-12', '11:30 AM – 12:10 PM', 'Stage 2'),
    ('Mimicry', date '2026-11-12', '12:10 AM – 12:30 PM', 'Stage 2'),
    ('Recitation (Malayalam)', date '2026-11-12', '12:30 PM – 1:30 PM', 'Stage 2'),
    ('Elocution (Malayalam)', date '2026-11-12', '2:00 PM – 2:25 PM', 'Stage 2'),
    ('Elocution (English)', date '2026-11-12', '2:25 PM – 2:55 PM', 'Stage 2'),
    ('Elocution (Tamil)', date '2026-11-12', '2:55 PM – 3:35 PM', 'Stage 2'),
    ('Monoact', date '2026-11-12', '3:35 PM – 4:10 PM', 'Stage 2'),

    ('Recitation (Hindi)', date '2026-11-13', '9:00 AM – 9:25 AM', 'Stage 1'),
    ('Oppana', date '2026-11-13', '9:30 AM – 10:00 AM', 'Stage 1'),
    ('Group Song', date '2026-11-13', '10:00 AM – 10:30 AM', 'Stage 1'),
    ('Folk Song', date '2026-11-13', '10:30 AM – 11:30 PM', 'Stage 1'),
    ('Thiruvathira', date '2026-11-13', '11:30 PM – 12:30 PM', 'Stage 1'),
    ('Skit', date '2026-11-13', '12:30 PM – 1:00 PM', 'Stage 1'),
    ('Closing Ceremony', date '2026-11-13', '1:00 PM', 'Stage 1')
),
updated as (
  update public.events e
  set event_time = s.event_time,
      venue = coalesce(s.venue, e.venue)
  from schedule s
  where lower(trim(e.title)) = lower(trim(s.title))
    and e.event_date = s.event_date
  returning e.id
)
select
  (select count(*) from updated) as updated_events,
  (select count(*) from schedule) as expected_events,
  (select count(*) from schedule s
   where not exists (
     select 1 from public.events e
     where lower(trim(e.title)) = lower(trim(s.title))
       and e.event_date = s.event_date
   )) as unmatched_schedule_rows;
