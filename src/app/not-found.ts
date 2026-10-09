import { Component, DOCUMENT, inject, input } from '@angular/core';
import { DEFAULT_THEME, fontStylesheetUrl, loadStylesheet, NEUTRAL_STYLE } from './theme';

/** Unknown, inactive and empty links land here, in the neutral theme. */
@Component({
  selector: 'app-not-found',
  host: {
    class: 'rsvp-page @container flow-root min-h-[var(--rsvp-screen,100dvh)]',
    '[style]': 'style',
  },
  template: `
    <main
      class="mx-4 mt-30 flex max-w-[560px] flex-col gap-4 rounded-rsvp border border-rsvp-border bg-rsvp-surface px-6 py-8 @3xl:mx-auto @3xl:mt-35 @3xl:p-12"
    >
      <div
        aria-hidden="true"
        class="grid size-12 place-items-center rounded-full border-2 border-rsvp-border text-[22px] font-semibold text-rsvp-muted"
      >
        ?
      </div>
      <h1 class="rsvp-heading text-[calc(28px*var(--rsvp-scale))] leading-[1.15] text-balance">
        {{ heading() }}
      </h1>
      <p class="text-pretty text-rsvp-muted">{{ message() }}</p>
      <ng-content />
    </main>
  `,
})
export default class NotFound {
  readonly heading = input("This RSVP page isn't available");
  readonly message = input(
    'The link may be mistyped, or the host has closed replies for this event. If you think this is a mistake, contact the person who invited you.',
  );

  protected readonly style = NEUTRAL_STYLE;

  constructor() {
    loadStylesheet(inject(DOCUMENT), fontStylesheetUrl(DEFAULT_THEME.typography.pairing));
  }
}
