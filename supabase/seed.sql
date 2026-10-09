-- Demo data: two contrasting events from docs/design/ plus sample replies.
-- Run once on an empty database (supabase db push --include-seed, or the SQL editor).
-- Theme JSON follows EventThemeV1 (docs/architecture.md, section 6).

insert into public.events (
  slug, title, description, event_date, start_time, end_time, timezone,
  location_name, location_address, rsvp_question, button_text, confirmation_message,
  notes_enabled, notes_required, notes_label, is_active, theme
) values
(
  'maya-6',
  'Maya turns 6!',
  'Bouncy castle, pizza and a very big cake. Grown-ups get coffee. Socks on, please!',
  '2026-11-14', '14:00', '17:00', 'Europe/London',
  'Jumpin'' Jungle Play Centre', '48 Harbour Road, Brighton BN2 1TR',
  'Will you be joining us?', 'Send my RSVP', 'Thank you! Can''t wait to see you there',
  true, true, 'Who''s coming?', true,
  '{
    "version": 1,
    "layout": "card",
    "colors": { "primary": "#5b2bd6", "accent": "#e5530c", "text": "#2b1a40", "surface": "#ffffff", "background": "#ffd66b" },
    "background": { "kind": "gradient", "gradientTo": "#ff9fbf", "overlay": 0, "blur": 0 },
    "hero": { "alt": "", "fit": "cover" },
    "typography": { "pairing": "playful", "scale": "lg" },
    "card": { "style": "solid", "radius": "xl" },
    "button": { "style": "pill" }
  }'
),
(
  'eleanor-and-james',
  'Eleanor & James',
  'We would be delighted if you could join us. Ceremony at half past two, followed by dinner and dancing.',
  '2027-06-05', '14:30', '23:00', 'Europe/London',
  'Holloway Hall', 'Lower Street, Chipping Norton OX7 5AA',
  'Will you attend?', 'Reply', 'Thank you. We look forward to celebrating with you.',
  true, false, 'Dietary requirements', true,
  '{
    "version": 1,
    "layout": "poster",
    "colors": { "primary": "#161412", "accent": "#8f6f3f", "text": "#161412", "surface": "#fbf8f1", "background": "#f1ebdf" },
    "background": { "kind": "color", "overlay": 0, "blur": 0 },
    "hero": { "alt": "", "fit": "cover" },
    "typography": { "pairing": "elegant", "scale": "lg" },
    "card": { "style": "outline", "radius": "none" },
    "button": { "style": "outline" }
  }'
);

insert into public.rsvps (event_id, guest_name, response, notes, created_at)
select e.id, r.guest_name, r.response::public.rsvp_response, r.notes,
       timestamptz '2026-10-01 09:00+00' + r.hours_later * interval '1 hour'
from (values
  ('maya-6',            'Priya Shah',     'yes',   'Priya + her dad, Sam',          1),
  ('maya-6',            'Tom Becker',     'yes',   'Tom + mum',                     3),
  ('maya-6',            'Aisha Rahman',   'yes',   'Aisha and baby brother (2)',    5),
  ('maya-6',            'Leo Martins',    'yes',   'Leo, nut allergy',              8),
  ('maya-6',            'Sofia Rossi',    'maybe', 'Sofia, depends on swimming',   12),
  ('maya-6',            'Ben Okafor',     'yes',   'Ben + mum',                    20),
  ('maya-6',            'Chloe Dubois',   'no',    'Swimming till 2, sorry!',      26),
  ('maya-6',            'Lucas Silva',    'yes',   'Lucas, gluten-free please',    31),
  ('maya-6',            '=Formula Test',  'maybe', '+test, checks CSV escaping',   40),
  ('eleanor-and-james', 'Hannah Kim',     'yes',   'Vegetarian',                    2),
  ('eleanor-and-james', 'Oliver Grant',   'yes',   null,                            6),
  ('eleanor-and-james', 'Mei Chen',       'maybe', null,                           14),
  ('eleanor-and-james', 'Ravi Kumar',     'no',    'So sorry to miss it!',         22),
  ('eleanor-and-james', 'Zoë Lindqvist',  'yes',   'No shellfish, please',         30)
) as r (slug, guest_name, response, notes, hours_later)
join public.events e on e.slug = r.slug;
