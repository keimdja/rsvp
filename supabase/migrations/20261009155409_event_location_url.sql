-- Optional map link for "Open in Maps" (Google Maps, Apple Maps, Waze short links, …).
-- Without it the page searches the address. https only, so it is always a safe web link.

alter table public.events
  add column location_url text
    check (location_url ~ '^https://[^\s]+$' and char_length(location_url) <= 2000);

-- The return type changes, so the function is dropped and recreated (with its grants).
drop function public.get_public_event(text);

create function public.get_public_event(p_slug text)
returns table (
  slug                 text,
  title                text,
  description          text,
  event_date           date,
  start_time           time,
  end_time             time,
  timezone             text,
  location_name        text,
  location_address     text,
  location_url         text,
  rsvp_question        text,
  button_text          text,
  confirmation_message text,
  notes_enabled        boolean,
  notes_required       boolean,
  notes_label          text,
  language             text,
  theme                jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.slug, e.title, e.description, e.event_date, e.start_time, e.end_time,
         e.timezone, e.location_name, e.location_address, e.location_url, e.rsvp_question,
         e.button_text, e.confirmation_message, e.notes_enabled, e.notes_required,
         e.notes_label, e.language, e.theme
  from public.events e
  where e.slug = lower(btrim(p_slug))
    and e.is_active;
$$;

revoke all on function public.get_public_event(text) from public, anon, authenticated;
grant execute on function public.get_public_event(text) to anon, authenticated;
