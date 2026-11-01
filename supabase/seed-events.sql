-- AROHA '26: bulk event programme import
-- Run once in Supabase SQL Editor after schema.sql.
-- Event dates are taken from the organisers' schedules.
-- Event times are intentionally left blank for the administrator to fill in under Manage Events.
-- Stage 1 / Stage 2 are prefilled as editable venue labels where the schedule specifies them.
-- Group events: Mime, Folk Dance, Group Dance, Oppana, Group Song, Thiruvathira, Skit.
-- Folk Song is set as individual because it was not identified as a group event in the organiser's clarification.
-- The import is safe to re-run: existing event title + date pairs are skipped.

with seed(title, category, competition_type, event_date, venue) as (
  values
    ('Debate', 'Literary', 'individual', date '2026-11-05', null),
    ('Quiz', 'Literary', 'individual', date '2026-11-06', null),

    ('Essay Writing Malayalam', 'Literary', 'individual', date '2026-11-09', null),
    ('Essay Writing Tamil', 'Literary', 'individual', date '2026-11-09', null),
    ('Essay Writing Hindi', 'Literary', 'individual', date '2026-11-09', null),
    ('Clay Modeling', 'Fine Arts', 'individual', date '2026-11-09', null),
    ('Poetry Writing Malayalam', 'Literary', 'individual', date '2026-11-09', null),
    ('Poetry Writing Tamil', 'Literary', 'individual', date '2026-11-09', null),
    ('Poetry Writing Hindi', 'Literary', 'individual', date '2026-11-09', null),
    ('Essay Writing English', 'Literary', 'individual', date '2026-11-09', null),
    ('Short Story Hindi', 'Literary', 'individual', date '2026-11-09', null),
    ('Short Story Tamil', 'Literary', 'individual', date '2026-11-09', null),
    ('Short Story English', 'Literary', 'individual', date '2026-11-09', null),
    ('Painting', 'Fine Arts', 'individual', date '2026-11-09', null),

    ('Short Story Malayalam', 'Literary', 'individual', date '2026-11-10', null),
    ('Poetry Writing English', 'Literary', 'individual', date '2026-11-10', null),
    ('Poster Making', 'Fine Arts', 'individual', date '2026-11-10', null),
    ('Cartooning', 'Fine Arts', 'individual', date '2026-11-10', null),

    ('Inauguration Ceremony', 'Other', 'programme', date '2026-11-12', 'Stage 1'),
    ('Recitation (Tamil)', 'Stage', 'individual', date '2026-11-12', 'Stage 1'),
    ('Recitation (English)', 'Stage', 'individual', date '2026-11-12', 'Stage 1'),
    ('Recitation (Urdu)', 'Stage', 'individual', date '2026-11-12', 'Stage 1'),
    ('Bharathanatyam', 'Stage', 'individual', date '2026-11-12', 'Stage 1'),
    ('Mime', 'Stage', 'group', date '2026-11-12', 'Stage 1'),
    ('Folk Dance', 'Stage', 'group', date '2026-11-12', 'Stage 1'),
    ('Katha Prasangam', 'Stage', 'individual', date '2026-11-12', 'Stage 1'),
    ('Group Dance', 'Stage', 'group', date '2026-11-12', 'Stage 1'),

    ('Light Music', 'Stage', 'individual', date '2026-11-12', 'Stage 2'),
    ('Mappilapattu', 'Stage', 'individual', date '2026-11-12', 'Stage 2'),
    ('Classical Music', 'Stage', 'individual', date '2026-11-12', 'Stage 2'),
    ('Mimicry', 'Stage', 'individual', date '2026-11-12', 'Stage 2'),
    ('Recitation (Malayalam)', 'Stage', 'individual', date '2026-11-12', 'Stage 2'),
    ('Elocution (Malayalam)', 'Stage', 'individual', date '2026-11-12', 'Stage 2'),
    ('Elocution (English)', 'Stage', 'individual', date '2026-11-12', 'Stage 2'),
    ('Elocution (Tamil)', 'Stage', 'individual', date '2026-11-12', 'Stage 2'),
    ('Monoact', 'Stage', 'individual', date '2026-11-12', 'Stage 2'),

    ('Recitation (Hindi)', 'Stage', 'individual', date '2026-11-13', 'Stage 1'),
    ('Oppana', 'Stage', 'group', date '2026-11-13', 'Stage 1'),
    ('Group Song', 'Stage', 'group', date '2026-11-13', 'Stage 1'),
    ('Folk Song', 'Stage', 'individual', date '2026-11-13', 'Stage 1'),
    ('Thiruvathira', 'Stage', 'group', date '2026-11-13', 'Stage 1'),
    ('Skit', 'Stage', 'group', date '2026-11-13', 'Stage 1'),
    ('Closing Ceremony', 'Other', 'programme', date '2026-11-13', 'Stage 1')
)
insert into public.events (title, category, competition_type, event_date, event_time, venue, is_published)
select s.title, s.category, s.competition_type, s.event_date, null, s.venue, true
from seed s
where not exists (
  select 1 from public.events e
  where lower(e.title) = lower(s.title)
    and e.event_date = s.event_date
);

-- Verify: should show 43 event rows if this is the first import and there are no pre-existing events.
select event_date, count(*) as events_on_date
from public.events
where event_date between date '2026-11-05' and date '2026-11-13'
group by event_date
order by event_date;
