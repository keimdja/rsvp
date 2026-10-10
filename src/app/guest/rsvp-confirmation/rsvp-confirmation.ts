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
import { guestTranslator } from '../../i18n';
import type { PublicEvent, ReplyInput } from '../../api/models';
import { googleCalendarUrl, icsFile, outlookCalendarUrl } from '../calendar';

@Component({
  selector: 'app-rsvp-confirmation',
  templateUrl: './rsvp-confirmation.html',
})
export class RsvpConfirmation {
  readonly event = input.required<PublicEvent>();
  readonly reply = input.required<ReplyInput>();
  readonly pageUrl = input.required<string>();
  /** Move focus to the message, so screen readers announce it right after submitting. */
  readonly focusOnShow = input(false);
  readonly edit = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  protected readonly secondary =
    'rsvp-secondary flex min-h-[50px] items-center justify-center font-bold';
  protected readonly icsRequested = signal(false);
  protected readonly t = guestTranslator();
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
