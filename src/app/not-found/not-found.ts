import { Component, DOCUMENT, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DEFAULT_THEME, fontStylesheetUrl, loadStylesheet, NEUTRAL_STYLE } from './theme';

/** Unknown, inactive and empty links land here, in the neutral theme. */
@Component({
  selector: 'app-not-found',
  imports: [TranslatePipe],
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
        {{ heading() ?? ('notFound.title' | translate) }}
      </h1>
      <p class="text-pretty text-rsvp-muted">{{ message() ?? ('notFound.message' | translate) }}</p>
      <ng-content />
    </main>
  `,
})
export default class NotFound {
  // Optional with template fallbacks: as a route component, router input binding sets
  // inputs that have no matching route param to undefined, which would erase defaults.
  readonly heading = input<string>();
  readonly message = input<string>();

  protected readonly style = NEUTRAL_STYLE;

  constructor() {
    loadStylesheet(inject(DOCUMENT), fontStylesheetUrl(DEFAULT_THEME.typography.pairing));
  }
}
