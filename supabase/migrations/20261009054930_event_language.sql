-- Per-event language for the guest page's fixed text ("When", "Your name", …).
-- The host's own wording is stored as typed; this only picks the UI language around it.

alter table public.events
  add column language text not null default 'en' check (language in ('en', 'es'));

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
         e.timezone, e.location_name, e.location_address, e.rsvp_question,
         e.button_text, e.confirmation_message, e.notes_enabled, e.notes_required,
         e.notes_label, e.language, e.theme
  from public.events e
  where e.slug = lower(btrim(p_slug))
    and e.is_active;
$$;

revoke all on function public.get_public_event(text) from public, anon, authenticated;
grant execute on function public.get_public_event(text) to anon, authenticated;
