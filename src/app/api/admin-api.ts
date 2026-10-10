import { inject, Injectable } from '@angular/core';
import type { AdminEvent, EventFields, EventSummary, Reply } from './models';
import { IMAGE_BUCKET, SUPABASE, unwrap } from './supabase';

/**
 * Endpoints for signed-in admins: backed by the admin_* database functions, which check
 * the caller is an admin, plus the Storage API for images. Failures throw ApiError.
 */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly supabase = inject(SUPABASE);

  // Events --------------------------------------------------------------------

  async listEvents(): Promise<EventSummary[]> {
    return unwrap(await this.supabase.rpc('admin_list_events'));
  }

  async getEvent(id: string): Promise<AdminEvent | null> {
    return unwrap(await this.supabase.rpc('admin_get_event', { p_id: id }).maybeSingle());
  }

  /** Creates an inactive event and returns its id; the server picks a free link. */
  async createEvent(fields: EventFields): Promise<string> {
    return unwrap(await this.supabase.rpc('admin_create_event', { p_fields: fields }));
  }

  /** Saves the given fields; a link that's already used fails with `slug_taken`. */
  async updateEvent(id: string, fields: EventFields): Promise<void> {
    unwrap(await this.supabase.rpc('admin_update_event', { p_id: id, p_fields: fields }));
  }

  /** Deletes the event, its replies and its images. */
  async deleteEvent(id: string): Promise<void> {
    unwrap(await this.supabase.rpc('admin_delete_event', { p_id: id }));
    const bucket = this.supabase.storage.from(IMAGE_BUCKET);
    const { data: files } = await bucket.list(id);
    if (files?.length) await bucket.remove(files.map((file) => `${id}/${file.name}`));
  }

  // Replies -------------------------------------------------------------------

  async listReplies(eventId: string): Promise<Reply[]> {
    return unwrap(await this.supabase.rpc('admin_list_replies', { p_event_id: eventId }));
  }

  async deleteReply(id: string): Promise<void> {
    unwrap(await this.supabase.rpc('admin_delete_reply', { p_id: id }));
  }

  // Images --------------------------------------------------------------------

  /** Stores an image for the event and returns its path (kept in the event's theme). */
  async uploadImage(eventId: string, kind: 'hero' | 'background', image: Blob): Promise<string> {
    const ext = image.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${eventId}/${kind}-${crypto.randomUUID()}.${ext}`;
    const { error } = await this.supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, image, { contentType: image.type, cacheControl: '31536000' });
    if (error) throw new Error(error.message);
    return path;
  }

  /** Removes images that are no longer used. Best effort: leftovers only cost storage. */
  async removeImages(paths: string[]): Promise<void> {
    if (paths.length) await this.supabase.storage.from(IMAGE_BUCKET).remove(paths);
  }
}
