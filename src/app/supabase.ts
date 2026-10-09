import { InjectionToken } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';
import type { Database } from './database.types';

export type Supabase = SupabaseClient<Database>;

/** The app's single Supabase client, created on first use with the publishable key. */
export const SUPABASE = new InjectionToken<Supabase>('SUPABASE', {
  providedIn: 'root',
  factory: () =>
    createClient<Database>(environment.supabaseUrl, environment.supabasePublishableKey),
});

export const IMAGE_BUCKET = 'event-images';

export const publicImageUrl = (supabase: Supabase, path: string): string =>
  supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;

// Row types. Postgres does not report nullability for function results, so the
// optional columns of get_public_event are marked nullable here.
type Public = Database['public'];
type WithNullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

export type RsvpResponse = Public['Enums']['rsvp_response'];
export type EventRow = Public['Tables']['events']['Row'];
export type RsvpRow = Public['Tables']['rsvps']['Row'];
export type EventSummary = Public['Views']['event_summaries']['Row'];
export type PublicEvent = WithNullable<
  Public['Functions']['get_public_event']['Returns'][number],
  'description' | 'end_time' | 'location_name' | 'location_address'
>;
