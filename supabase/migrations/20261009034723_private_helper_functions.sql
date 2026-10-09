-- Security Advisor follow-up (lints 0028 and 0029): keep helper functions off /rest/v1/rpc.
-- get_public_event and submit_rsvp stay in public on purpose; they are the guest API.

-- is_admin() exists only for RLS policies. The Data API does not expose the private
-- schema, but policies still run it as the caller, so authenticated keeps USAGE + EXECUTE.
-- Policies reference the function by OID, so they follow the move unchanged.
create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter function public.is_admin() set schema private;

-- rls_auto_enable() backs the "Automatic RLS" event trigger and is never called directly.
revoke execute on function public.rls_auto_enable() from public;
