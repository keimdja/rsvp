-- RSVP app: initial schema.
-- Guests (anon) have no table access and reach data only through get_public_event and
-- submit_rsvp. Signed-in users get table privileges, and RLS limits them to admins.
-- See docs/architecture.md, sections 3 and 4.

-- ---------------------------------------------------------------------------
-- Types and tables
-- ---------------------------------------------------------------------------

create type public.rsvp_response as enum ('yes', 'maybe', 'no');

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.events (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique
                       check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                              and char_length(slug) between 3 and 64
                              and slug not in ('admin', 'login', 'assets', 'index')),
  title                text not null check (char_length(title) between 1 and 120),
  description          text check (char_length(description) <= 4000),
  event_date           date not null,
  start_time           time not null,
  end_time             time,  -- null: no end; end <= start: ends the next day
  timezone             text not null default 'America/Puerto_Rico',
  location_name        text check (char_length(location_name) <= 200),
  location_address     text check (char_length(location_address) <= 300),
  rsvp_question        text not null default 'Will you be joining us?'
                       check (char_length(rsvp_question) between 1 and 200),
  button_text          text not null default 'Send RSVP'
                       check (char_length(button_text) between 1 and 40),
  confirmation_message text not null default 'Thank you! We can''t wait to see you.'
                       check (char_length(confirmation_message) between 1 and 500),
  notes_enabled        boolean not null default true,
  notes_required       boolean not null default false,
  notes_label          text not null default 'Anything we should know?'
                       check (char_length(notes_label) between 1 and 120),
  is_active            boolean not null default false,
  theme                jsonb not null default '{"version": 1}'
                       check (jsonb_typeof(theme) = 'object'),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (notes_enabled or not notes_required)
);

create table public.rsvps (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  guest_name text not null check (char_length(btrim(guest_name)) between 1 and 100),
  response   public.rsvp_response not null,
  notes      text check (char_length(notes) <= 1000),
  -- Returned to the guest's browser so "Change my reply" updates this row.
  edit_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rsvps_event_id_created_at_idx on public.rsvps (event_id, created_at desc);

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger events_touch_updated_at before update on public.events
  for each row execute function public.touch_updated_at();
create trigger rsvps_touch_updated_at before update on public.rsvps
  for each row execute function public.touch_updated_at();

-- Dashboard counts. security_invoker makes the view obey the caller's RLS.
create view public.event_summaries
with (security_invoker = true)
as
select e.id,
       e.slug,
       e.title,
       e.event_date,
       e.is_active,
       count(r.id) filter (where r.response = 'yes')   as yes_count,
       count(r.id) filter (where r.response = 'maybe') as maybe_count,
       count(r.id) filter (where r.response = 'no')    as no_count,
       count(r.id)                                     as total_count
from public.events e
left join public.rsvps r on r.event_id = e.id
group by e.id;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Security definer so RLS policies can read admins without recursion.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- Public: one active event by slug, public fields only.
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
         e.notes_label, e.theme
  from public.events e
  where e.slug = lower(btrim(p_slug))
    and e.is_active;
$$;

-- Public: create a reply, or update it when the guest passes back their edit token.
-- Returns the edit token. Errors are raised as P0001 with a stable message code.
create function public.submit_rsvp(
  p_slug       text,
  p_guest_name text,
  p_response   public.rsvp_response,
  p_notes      text default null,
  p_edit_token uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id       uuid;
  v_notes_enabled  boolean;
  v_notes_required boolean;
  v_name           text := btrim(coalesce(p_guest_name, ''));
  v_notes          text := nullif(btrim(coalesce(p_notes, '')), '');
  v_token          uuid;
begin
  select e.id, e.notes_enabled, e.notes_required
    into v_event_id, v_notes_enabled, v_notes_required
  from public.events e
  where e.slug = lower(btrim(p_slug))
    and e.is_active;

  if not found then
    raise exception 'event_unavailable';
  end if;
  if char_length(v_name) not between 1 and 100 then
    raise exception 'invalid_name';
  end if;
  if p_response is null then
    raise exception 'invalid_response';
  end if;
  if not v_notes_enabled then
    v_notes := null;
  elsif v_notes_required and v_notes is null then
    raise exception 'notes_required';
  elsif char_length(v_notes) > 1000 then
    raise exception 'notes_too_long';
  end if;

  if p_edit_token is not null then
    update public.rsvps
       set guest_name = v_name, response = p_response, notes = v_notes
     where event_id = v_event_id
       and edit_token = p_edit_token
    returning edit_token into v_token;

    if found then
      return v_token;
    end if;
    -- Token unknown (e.g. the host deleted the reply): fall through to a new row.
  end if;

  if (select count(*) from public.rsvps where event_id = v_event_id) >= 1000 then
    raise exception 'rsvp_limit_reached';
  end if;

  insert into public.rsvps (event_id, guest_name, response, notes)
  values (v_event_id, v_name, p_response, v_notes)
  returning edit_token into v_token;

  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Functions get EXECUTE for PUBLIC by default, and Supabase also grants it to the API roles.
revoke all on function
  public.touch_updated_at(),
  public.is_admin(),
  public.get_public_event(text),
  public.submit_rsvp(text, text, public.rsvp_response, text, uuid)
from public, anon, authenticated;

grant execute on function public.get_public_event(text) to anon, authenticated;
grant execute on function public.submit_rsvp(text, text, public.rsvp_response, text, uuid) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- Tables: start from nothing, then grant only what the admin UI uses. RLS does the rest.
revoke all on public.admins, public.events, public.rsvps, public.event_summaries
from anon, authenticated;

grant select, insert, update, delete on public.events, public.rsvps to authenticated;
grant select on public.admins, public.event_summaries to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.admins enable row level security;
alter table public.events enable row level security;
alter table public.rsvps  enable row level security;

create policy events_admin_all on public.events
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy rsvps_admin_all on public.rsvps
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Lets a signed-in user learn whether they are an admin. Admins are added in the
-- SQL editor only, so there is no insert/update/delete policy.
create policy admins_read_self on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: public-read bucket for event images, writable by admins only
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-images', 'event-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp']);

-- Public URLs bypass these policies; they govern the Storage API (list, upload, replace, delete).
create policy event_images_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'event-images' and (select public.is_admin()));

create policy event_images_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-images' and (select public.is_admin()));

create policy event_images_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'event-images' and (select public.is_admin()))
  with check (bucket_id = 'event-images' and (select public.is_admin()));

create policy event_images_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-images' and (select public.is_admin()));
