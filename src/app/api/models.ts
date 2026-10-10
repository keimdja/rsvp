// Data shapes the app sends to and receives from the API.
import type { Database } from './database.types';

type Public = Database['public'];
type Functions = Public['Functions'];
type WithNullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

export type RsvpResponse = Public['Enums']['rsvp_response'];
/** Display order; labels are translated under the `response.*` keys. */
export const RESPONSES: readonly RsvpResponse[] = ['yes', 'maybe', 'no'];

/** An event as guests see it. Postgres doesn't report nullability for function results. */
export type PublicEvent = WithNullable<
  Functions['get_public_event']['Returns'][number],
  'description' | 'end_time' | 'location_name' | 'location_address' | 'location_url'
>;

/** A guest's reply as sent from the RSVP form. */
export interface ReplyInput {
  guest_name: string;
  response: RsvpResponse;
  notes: string;
}

/** A full event, as the admin edits it. */
export type AdminEvent = Public['Tables']['events']['Row'];
/** Editable event fields; any subset can be sent. */
export type EventFields = Omit<
  Public['Tables']['events']['Update'],
  'id' | 'created_at' | 'updated_at'
>;
/** One row of the dashboard: an event with its reply counts. */
export type EventSummary = Functions['admin_list_events']['Returns'][number];
/** One reply in the admin list. */
export type Reply = WithNullable<Functions['admin_list_replies']['Returns'][number], 'notes'>;

/**
 * A failed API call. `code` is the backend's error name (`slug_taken`, `event_unavailable`,
 * `notes_required`, `not_authorized`, …), `invalid_input`, `network` or `unknown`.
 */
export class ApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ApiError';
  }
}
