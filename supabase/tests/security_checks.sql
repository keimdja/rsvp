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
  v_rows   bigint;
begin
  if private.is_admin() then
    raise exception 'FAIL: a non-admin is reported as admin';
  end if;

  foreach v_object in array array['events', 'rsvps', 'admins', 'event_summaries'] loop
    execute format('select count(*) from public.%I', v_object) into v_rows;
    if v_rows <> 0 then
      raise exception 'FAIL: non-admin can see % rows in %', v_rows, v_object;
    end if;
  end loop;

  begin
    insert into public.events (slug, title, event_date, start_time)
    values ('sec-test-sneaky', 'x', current_date, '12:00');
    raise exception 'FAIL: non-admin can insert an event';
  exception when insufficient_privilege then null;
  end;

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
begin
  if current_setting('request.jwt.claims', true) = '' then
    raise notice 'SKIP: no admin yet, admin checks not run';
    return;
  end if;
  if not private.is_admin() then
    raise exception 'FAIL: admin is not recognised by is_admin()';
  end if;
  if not exists (select from public.events where slug = 'sec-test-closed') then
    raise exception 'FAIL: admin cannot read inactive events';
  end if;
  if not exists (select from public.event_summaries where slug = 'sec-test-open' and total_count = 2) then
    raise exception 'FAIL: admin cannot read event_summaries counts';
  end if;
end $$;

reset role;

select 'PASS: all security checks passed' as result;

rollback;
