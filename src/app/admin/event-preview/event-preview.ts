import { Component, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Invite } from '../../guest/invite/invite';
import { RsvpConfirmation } from '../../guest/rsvp-confirmation/rsvp-confirmation';
import { RsvpForm } from '../../guest/rsvp-form/rsvp-form';
import type { PublicEvent, ReplyInput } from '../../api/models';
import type { EventTheme } from '../../theme';

type PreviewState = 'form' | 'errors' | 'sent';

const SAMPLE_REPLY: ReplyInput = { guest_name: 'Priya Shah', response: 'yes', notes: '' };

/**
 * The guest page as guests will see it, rendered by the same components. On wide screens
 * it sits in a 375px phone frame scaled to 92%; --rsvp-screen stands in for the phone's
 * screen height so full-screen layouts (poster) size to the frame.
 */
@Component({
  selector: 'app-event-preview',
  imports: [Invite, RsvpConfirmation, RsvpForm, TranslatePipe],
  host: { class: 'flex flex-col gap-3' },
  templateUrl: './event-preview.html',
})
export class EventPreview {
  readonly event = input.required<PublicEvent>();
  readonly theme = input.required<EventTheme>();
  readonly active = input.required<boolean>();
  readonly pageUrl = input.required<string>();

  protected readonly states: readonly PreviewState[] = ['form', 'errors', 'sent'];
  protected readonly state = signal<PreviewState>('form');
  protected readonly sample = SAMPLE_REPLY;
}
