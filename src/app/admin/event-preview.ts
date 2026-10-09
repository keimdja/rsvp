import { Component, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Invite } from '../guest/invite';
import { RsvpConfirmation } from '../guest/rsvp-confirmation';
import { type RsvpDraft, RsvpForm } from '../guest/rsvp-form';
import type { PublicEvent } from '../supabase';
import type { EventTheme } from '../theme';

type PreviewState = 'form' | 'errors' | 'sent';

const SAMPLE_REPLY: RsvpDraft = { guest_name: 'Priya Shah', response: 'yes', notes: '' };

/**
 * The guest page as guests will see it, rendered by the same components. On wide screens
 * it sits in a 375px phone frame scaled to 92%; --rsvp-screen stands in for the phone's
 * screen height so full-screen layouts (poster) size to the frame.
 */
@Component({
  selector: 'app-event-preview',
  imports: [Invite, RsvpConfirmation, RsvpForm, TranslatePipe],
  host: { class: 'flex flex-col gap-3' },
  template: `
    <div class="flex items-center justify-between gap-2 px-4 wide:px-0">
      <h2 class="font-semibold">{{ 'admin.preview.title' | translate }}</h2>
      <div class="segmented">
        @for (s of states; track s) {
          <button type="button" [attr.aria-pressed]="state() === s" (click)="state.set(s)">
            {{ 'admin.preview.states.' + s | translate }}
          </button>
        }
      </div>
    </div>

    @if (!active()) {
      <p role="status" class="warning mx-4 wide:mx-0">
        <span aria-hidden="true" class="font-bold">!</span
        >{{ 'admin.preview.inactive' | translate }}
      </p>
    }

    <div
      class="wide:box-content wide:h-[min(720px,calc(100dvh-160px))] wide:w-[346px] wide:self-center wide:overflow-hidden wide:rounded-[36px] wide:border-8 wide:border-ink wide:bg-black"
    >
      <div class="wide:h-full wide:overflow-x-hidden wide:overflow-y-auto">
        <div
          class="wide:w-[375px] wide:[--rsvp-screen:calc(min(720px,100dvh-160px)/0.9227)] wide:[zoom:0.9227]"
        >
          <!-- Always the invite, even while replies are off: the host is still building it. -->
          <app-invite framed [event]="event()" [theme]="theme()">
            @switch (state()) {
              @case ('sent') {
                <app-rsvp-confirmation [event]="event()" [reply]="sample" [pageUrl]="pageUrl()" />
              }
              @default {
                <app-rsvp-form [event]="event()" [showErrors]="state() === 'errors'" />
              }
            }
          </app-invite>
        </div>
      </div>
    </div>
  `,
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
