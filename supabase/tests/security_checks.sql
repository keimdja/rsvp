-- Security checks for the RSVP schema. Paste into the Supabase SQL editor and run.
-- Everything happens inside one transaction that is rolled back, so nothing persists.
-- Each block raises 'FAIL: ...' on the first broken rule; the last line prints when all pass.

begin;

-- Fixtures, created as the editor's postgres role.
insert into public.events (slug, title, event_date, start_time, is_active, notes_required)
values ('sec-test-open',   'Open',   current_date, '12:00', true,  false),
       ('sec-test-closed', 'Closed', current_date, '12:00', false, false),
       ('sec-test-notes',  'Notes',  current_date, '12:00', true,  true);

-- ---------------------------------------------------------------------------
-- 1. Anonymous guest (publishable key, no session)
-- ---------------------------------------------------------------------------
set local role anon;

do $$
declare
  v_object text;
  v_token  uuid;
  v_token2 uuid;
begin
  -- No table or view access at all, read or write.
  foreach v_object in array array['events', 'rsvps', 'admins', 'event_summaries'] loop
    begin
      execute format('select 1 from public.%I limit 1', v_object);
      raise exception 'FAIL: anon can select from %', v_object;
    exception when insufficient_privilege then null;
    end;
  end loop;

  begin
    insert into public.rsvps (event_id, guest_name, response)
    values (gen_random_uuid(), 'x', 'yes');
    raise exception 'FAIL: anon can insert into rsvps';
  exception when insufficient_privilege then null;
  end;

  begin
    perform private.is_admin();
    raise exception 'FAIL: anon can execute is_admin()';
  exception when insufficient_privilege then null;
  end;

  -- None of the admin API is callable without signing in.
  foreach v_object in array array[
    'current_user_is_admin()', 'admin_list_events()',
    format('admin_get_event(%L)', gen_random_uuid()), 'admin_create_event()',
    format('admin_update_event(%L, ''{}'')', gen_random_uuid()),
    format('admin_delete_event(%L)', gen_random_uuid()),
    format('admin_list_replies(%L)', gen_random_uuid()),
    format('admin_delete_reply(%L)', gen_random_uuid())
  ] loop
    begin
      execute 'select public.' || v_object;
      raise exception 'FAIL: anon can call %', v_object;
    exception when insufficient_privilege then null;
    end;
  end loop;

  begin
    insert into storage.objects (bucket_id, name) values ('event-images', 'sec-test.jpg');
    raise exception 'FAIL: anon can upload to event-images';
  exception when insufficient_privilege then null;
  end;

  -- get_public_event: active events only, slug normalised.
  if (select count(*) from public.get_public_event('sec-test-open')) <> 1 then
    raise exception 'FAIL: get_public_event does not return an active event';
  end if;
  if (select count(*) from public.get_public_event('  SEC-TEST-OPEN ')) <> 1 then
    raise exception 'FAIL: get_public_event does not normalise the slug';
  end if;
  if exists (select from public.get_public_event('sec-test-closed')) then
    raise exception 'FAIL: get_public_event returns an inactive event';
  end if;
  if exists (select from public.get_public_event('sec-test-missing')) then
    raise exception 'FAIL: get_public_event returns something for an unknown slug';
  end if;

  -- submit_rsvp: business rules.
  begin
    perform public.submit_rsvp('sec-test-closed', 'Guest', 'yes');
    raise exception 'FAIL: submit_rsvp accepts an inactive event';
  exception when raise_exception then
    if sqlerrm <> 'event_unavailable' then raise; end if;
  end;

  begin
    perform public.submit_rsvp('sec-test-open', '   ', 'yes');
    raise exception 'FAIL: submit_rsvp accepts a blank name';
  exception when raise_exception then
    if sqlerrm <> 'invalid_name' then raise; end if;
  end;

  begin
    perform public.submit_rsvp('sec-test-notes', 'Guest', 'yes', '  ');
    raise exception 'FAIL: submit_rsvp accepts missing required notes';
  exception when raise_exception then
    if sqlerrm <> 'notes_required' then raise; end if;
  end;

  -- submit_rsvp: create, then edit with the returned token.
  v_token := public.submit_rsvp('sec-test-open', 'Guest One', 'yes', 'first');
  if v_token is null then
    raise exception 'FAIL: submit_rsvp did not return an edit token';
  end if;

  v_token2 := public.submit_rsvp('sec-test-open', 'Guest One', 'no', 'changed', v_token);
  if v_token2 <> v_token then
    raise exception 'FAIL: submit_rsvp with a token did not update the same reply';
  end if;

  -- An unknown token creates a new reply rather than failing.
  v_token2 := public.submit_rsvp('sec-test-open', 'Guest Two', 'maybe', null, gen_random_uuid());
  if v_token2 = v_token then
    raise exception 'FAIL: submit_rsvp with an unknown token reused another reply';
  end if;
end $$;

reset role;

do $$
declare
  v_rows int;
begin
  select count(*) into v_rows
  from public.rsvps r join public.events e on e.id = r.event_id
  where e.slug = 'sec-test-open';
  if v_rows <> 2 then
    raise exception 'FAIL: expected 2 replies on sec-test-open, found %', v_rows;
  end if;

  if not exists (
    select from public.rsvps r join public.events e on e.id = r.event_id
    where e.slug = 'sec-test-open' and r.guest_name = 'Guest One'
      and r.response = 'no' and r.notes = 'changed'
  ) then
    raise exception 'FAIL: the edited reply was not updated';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Signed-in user who is not in admins
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-000000000000", "role": "authenticated"}', true);

do $$
declare
  v_object text;
begin
  if public.current_user_is_admin() then
    raise exception 'FAIL: a non-admin is reported as admin';
  end if;

  -- Signed-in users have no direct table access: data goes through the API functions.
  foreach v_object in array array['events', 'rsvps', 'admins', 'event_summaries'] loop
    begin
      execute format('select 1 from public.%I limit 1', v_object);
      raise exception 'FAIL: signed-in user can select from %', v_object;
    exception when insufficient_privilege then null;
    end;
  end loop;

  begin
    insert into public.events (slug, title, event_date, start_time)
    values ('sec-test-sneaky', 'x', current_date, '12:00');
    raise exception 'FAIL: non-admin can insert an event';
  exception when insufficient_privilege then null;
  end;

  -- Every admin function refuses a non-admin (not_authorized is SQLSTATE 42501).
  foreach v_object in array array[
    'admin_list_events()',
    format('admin_get_event(%L)', gen_random_uuid()), 'admin_create_event()',
    format('admin_update_event(%L, ''{}'')', gen_random_uuid()),
    format('admin_delete_event(%L)', gen_random_uuid()),
    format('admin_list_replies(%L)', gen_random_uuid()),
    format('admin_delete_reply(%L)', gen_random_uuid())
  ] loop
    begin
      execute 'select public.' || v_object;
      raise exception 'FAIL: non-admin can call %', v_object;
    exception when insufficient_privilege then null;
    end;
  end loop;

  begin
    insert into storage.objects (bucket_id, name) values ('event-images', 'sec-test.jpg');
    raise exception 'FAIL: non-admin can upload to event-images';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 3. Admin (skipped until a row exists in public.admins)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  coalesce(
    (select json_build_object('sub', user_id, 'role', 'authenticated')::text
     from public.admins limit 1),
    ''),
  true);
set local role authenticated;

do $$
declare
  v_open    uuid;
  v_closed  uuid;
  v_created uuid;
  v_reply   uuid;
begin
  if current_setting('request.jwt.claims', true) = '' then
    raise notice 'SKIP: no admin yet, admin checks not run';
    return;
  end if;
  if not public.current_user_is_admin() then
    raise exception 'FAIL: admin is not recognised';
  end if;
  v_open   := (select id from public.admin_list_events() where slug = 'sec-test-open');
  v_closed := (select id from public.admin_list_events() where slug = 'sec-test-closed');

  -- Even admins have no direct table access.
  begin
    perform 1 from public.events limit 1;
    raise exception 'FAIL: admin can select from events directly';
  exception when insufficient_privilege then null;
  end;

  if not exists (select from public.admin_list_events() where slug = 'sec-test-open' and total_count = 2)
     or not exists (select from public.admin_list_events() where slug = 'sec-test-closed') then
    raise exception 'FAIL: admin_list_events misses events or counts';
  end if;
  if (select title from public.admin_get_event(v_closed)) is distinct from 'Closed' then
    raise exception 'FAIL: admin_get_event does not return the event';
  end if;

  -- Update: changes named fields only; id cannot change; duplicate links are slug_taken.
  perform public.admin_update_event(v_closed, jsonb_build_object('title', 'Renamed', 'id', gen_random_uuid()));
  if (select title from public.admin_get_event(v_closed)) is distinct from 'Renamed' then
    raise exception 'FAIL: admin_update_event did not update the title (or changed the id)';
  end if;
  begin
    perform public.admin_update_event(v_closed, '{"slug": "sec-test-open"}');
    raise exception 'FAIL: admin_update_event accepted a duplicate link';
  exception when raise_exception then
    if sqlerrm <> 'slug_taken' then raise; end if;
  end;

  -- Create: unique link chosen on the server, always inactive.
  v_created := public.admin_create_event('{"slug": "sec-test-open", "title": "Created", "is_active": true}');
  if not exists (
    select from public.admin_get_event(v_created)
    where slug = 'sec-test-open-2' and title = 'Created' and not is_active
  ) then
    raise exception 'FAIL: admin_create_event did not pick a free link or left it active';
  end if;

  -- Replies: list and delete.
  if (select count(*) from public.admin_list_replies(v_open)) <> 2 then
    raise exception 'FAIL: admin_list_replies does not return the replies';
  end if;
  v_reply := (select id from public.admin_list_replies(v_open) limit 1);
  perform public.admin_delete_reply(v_reply);
  if (select count(*) from public.admin_list_replies(v_open)) <> 1 then
    raise exception 'FAIL: admin_delete_reply did not delete the reply';
  end if;

  -- Delete event: gone, with its replies.
  perform public.admin_delete_event(v_open);
  if exists (select from public.admin_get_event(v_open)) then
    raise exception 'FAIL: admin_delete_event did not delete the event';
  end if;
end $$;

reset role;

select 'PASS: all security checks passed' as result;

rollback;
