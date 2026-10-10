-- Admin API: every admin read and write is a named function, called over
-- /rest/v1/rpc/<name>. The frontend holds no query logic, and signed-in users lose
-- direct table access: these functions (and the two guest functions) are the only way in.
--
-- Each admin_* function is security definer, starts with private.require_admin(), and
-- reads or writes only what it names. RLS stays enabled on the tables as a backstop.

-- ---------------------------------------------------------------------------
-- Helpers (not exposed: the Data API doesn't serve the private schema)
-- ---------------------------------------------------------------------------

create function private.require_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$$;

-- Applies the given fields to an event. Keys that are absent keep their current value;
-- only the listed columns can change (never id, created_at or updated_at).
create function private.apply_event_changes(p_id uuid, p_fields jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception 'invalid_event';
  end if;

  update public.events e
     set (slug, title, description, event_date, start_time, end_time, timezone,
          location_name, location_address, location_url, rsvp_question, button_text,
          confirmation_message, notes_enabled, notes_required, notes_label, is_active,
          language, theme)
       = (select r.slug, r.title, r.description, r.event_date, r.start_time, r.end_time,
                 r.timezone, r.location_name, r.location_address, r.location_url,
                 r.rsvp_question, r.button_text, r.confirmation_message, r.notes_enabled,
                 r.notes_required, r.notes_label, r.is_active, r.language, r.theme
          from jsonb_populate_record(e, p_fields) r)
   where e.id = p_id;

  if not found then
    raise exception 'event_not_found';
  end if;
exception
  when unique_violation then
    raise exception 'slug_taken';
end;
$$;

revoke all on function private.require_admin(), private.apply_event_changes(uuid, jsonb)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Auth
-- ---------------------------------------------------------------------------

-- Lets the app decide which screen to show; the admin_* functions check again.
create function public.current_user_is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.is_admin();
$$;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

create function public.admin_list_events()
returns setof public.event_summaries
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select * from public.event_summaries s order by s.event_date, s.title;
end;
$$;

create function public.admin_get_event(p_id uuid)
returns setof public.events
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query select * from public.events e where e.id = p_id;
end;
$$;

-- Creates an inactive event with the given fields and returns its id. The link is made
-- unique here: "new-event" (or the requested slug) gets -2, -3, … when taken.
create function public.admin_create_event(p_fields jsonb default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text := coalesce(nullif(p_fields ->> 'slug', ''), 'new-event');
  v_slug text := v_base;
  v_n    int  := 1;
  v_id   uuid;
begin
  perform private.require_admin();
  while exists (select 1 from public.events where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into public.events (slug, title, event_date, start_time, end_time)
  values (v_slug, 'New event', current_date + 30, '18:00', '21:00')
  returning id into v_id;

  perform private.apply_event_changes(v_id, coalesce(p_fields, '{}') - 'slug' - 'is_active');
  return v_id;
end;
$$;

create function public.admin_update_event(p_id uuid, p_fields jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  perform private.apply_event_changes(p_id, p_fields);
end;
$$;

-- Deletes the event and, through the foreign key, its replies. Images live in Storage
-- and are removed through the Storage API (SQL can't delete stored files).
create function public.admin_delete_event(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.events where id = p_id;
  if not found then
    raise exception 'event_not_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Replies
-- ---------------------------------------------------------------------------

create function public.admin_list_replies(p_event_id uuid)
returns table (
  id         uuid,
  guest_name text,
  response   public.rsvp_response,
  notes      text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select r.id, r.guest_name, r.response, r.notes, r.created_at
    from public.rsvps r
    where r.event_id = p_event_id
    order by r.created_at desc;
end;
$$;

create function public.admin_delete_reply(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.rsvps where id = p_id;
  if not found then
    raise exception 'reply_not_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function
  public.current_user_is_admin(),
  public.admin_list_events(),
  public.admin_get_event(uuid),
  public.admin_create_event(jsonb),
  public.admin_update_event(uuid, jsonb),
  public.admin_delete_event(uuid),
  public.admin_list_replies(uuid),
  public.admin_delete_reply(uuid)
from public, anon;

grant execute on function
  public.current_user_is_admin(),
  public.admin_list_events(),
  public.admin_get_event(uuid),
  public.admin_create_event(jsonb),
  public.admin_update_event(uuid, jsonb),
  public.admin_delete_event(uuid),
  public.admin_list_replies(uuid),
  public.admin_delete_reply(uuid)
to authenticated;

-- Signed-in users reach data only through the functions above.
revoke all on public.events, public.rsvps, public.admins, public.event_summaries
from authenticated;
