import {
  afterNextRender,
  Component,
  computed,
  DOCUMENT,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RESPONSE_LABELS, type PublicEvent } from '../supabase';
import { googleCalendarUrl, icsFile, outlookCalendarUrl } from './calendar';
import type { RsvpDraft } from './rsvp-form';

@Component({
  selector: 'app-rsvp-confirmation',
  template: `
    <div class="flex flex-col gap-[22px]">
      <div
        aria-hidden="true"
        class="grid size-14 place-items-center rounded-full bg-rsvp-primary text-[26px] font-extrabold text-rsvp-on-primary"
      >
        ✓
      </div>

      <div class="flex flex-col gap-2">
        <h2
          #heading
          tabindex="-1"
          class="rsvp-heading text-[calc(30px*var(--rsvp-scale))] leading-[1.1] text-balance focus:outline-none"
        >
          {{ event().confirmation_message }}
        </h2>
        <p class="text-rsvp-muted">
          Reply saved for <strong class="text-rsvp-text">{{ reply().guest_name }}</strong
          >:
          <strong class="text-rsvp-text">{{ responseLabel() }}</strong>
        </p>
      </div>

      @if (reply().response !== 'no') {
        <section
          class="flex flex-col gap-3 border-t-2 border-rsvp-accent pt-5"
          aria-labelledby="rsvp-calendar"
        >
          <h3 id="rsvp-calendar" class="font-bold">Add to calendar</h3>
          <div class="grid gap-2">
            <a [href]="googleUrl()" target="_blank" rel="noopener" [class]="secondary"
              >Google Calendar</a
            >
            <button type="button" [class]="secondary" (click)="downloadIcs()">
              Apple Calendar (.ics)
            </button>
            <a [href]="outlookUrl()" target="_blank" rel="noopener" [class]="secondary">Outlook</a>
          </div>
          @if (icsRequested()) {
            <p role="status" class="text-sm text-rsvp-muted">
              Nothing downloaded? Open this page in Safari or Chrome and try again.
            </p>
          }
        </section>
      }

      <button type="button" class="rsvp-link min-h-11 self-start" (click)="edit.emit()">
        Change my reply
      </button>
    </div>
  `,
})
export class RsvpConfirmation {
  readonly event = input.required<PublicEvent>();
  readonly reply = input.required<RsvpDraft>();
  readonly pageUrl = input.required<string>();
  /** Move focus to the message, so screen readers announce it right after submitting. */
  readonly focusOnShow = input(false);
  readonly edit = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  protected readonly secondary =
    'rsvp-secondary flex min-h-[50px] items-center justify-center font-bold';
  protected readonly icsRequested = signal(false);
  protected readonly responseLabel = computed(() => RESPONSE_LABELS[this.reply().response]);
  protected readonly googleUrl = computed(() => googleCalendarUrl(this.event(), this.pageUrl()));
  protected readonly outlookUrl = computed(() => outlookCalendarUrl(this.event(), this.pageUrl()));

  constructor() {
    afterNextRender(() => {
      if (this.focusOnShow()) this.heading().nativeElement.focus();
    });
  }

  protected downloadIcs(): void {
    const blob = new Blob([icsFile(this.event(), this.pageUrl())], {
      type: 'text/calendar;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = `${this.event().slug}.ics`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    // In-app browsers (WhatsApp, Instagram) can silently block downloads.
    this.icsRequested.set(true);
  }
}
