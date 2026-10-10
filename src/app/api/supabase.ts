// The Supabase connection. Internal to src/app/api: everything else goes through the API
// services (public-api, admin-api, auth-api), enforced by scripts/check-api-boundary.mjs.
import { InjectionToken } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import type { Database } from './database.types';
import { ApiError } from './models';

export type Supabase = SupabaseClient<Database>;

/** The app's single Supabase client, created on first use with the publishable key. */
export const SUPABASE = new InjectionToken<Supabase>('SUPABASE', {
  providedIn: 'root',
  factory: () =>
    createClient<Database>(environment.supabaseUrl, environment.supabasePublishableKey),
});

export const IMAGE_BUCKET = 'event-images';

interface Response<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

/**
 * Returns a call's data, or throws an ApiError. Backend functions raise errors named
 * like `slug_taken`; those names become the error code. Failed requests without a
 * database error code are network problems.
 */
export function unwrap<T>({ data, error }: Response<T>): T {
  if (!error) return data as T;
  if (/^[a-z_]+$/.test(error.message)) throw new ApiError(error.message);
  if (error.code === '23514' || error.code?.startsWith('22')) throw new ApiError('invalid_input');
  throw new ApiError(error.code ? 'unknown' : 'network');
}
