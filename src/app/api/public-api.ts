import { inject, Injectable } from '@angular/core';
import { type PublicEvent, type ReplyInput } from './models';
import { IMAGE_BUCKET, SUPABASE, unwrap } from './supabase';

/** Endpoints available to guests (no sign-in): backed by get_public_event and submit_rsvp. */
@Injectable({ providedIn: 'root' })
export class PublicApi {
  private readonly supabase = inject(SUPABASE);

  /** An active event by its link, or null when it doesn't exist or replies are closed. */
  async getEvent(slug: string): Promise<PublicEvent | null> {
    return unwrap(await this.supabase.rpc('get_public_event', { p_slug: slug }).maybeSingle());
  }

  /**
   * Sends a reply, or updates an earlier one when its edit token is given. Returns the
   * edit token to keep for later changes.
   */
  async submitReply(slug: string, reply: ReplyInput, editToken?: string): Promise<string> {
    return unwrap(
      await this.supabase.rpc('submit_rsvp', {
        p_slug: slug,
        p_guest_name: reply.guest_name,
        p_response: reply.response,
        p_notes: reply.notes || undefined,
        p_edit_token: editToken || undefined,
      }),
    );
  }

  /** The public URL of an uploaded event image. */
  imageUrl(path: string): string {
    return this.supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  }
}
