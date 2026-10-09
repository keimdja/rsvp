import { Component, DOCUMENT, inject } from '@angular/core';
import { DEFAULT_THEME, fontStylesheetUrl, loadStylesheet, themeToStyle } from './theme';

// The default theme never uses a background image, so no URL resolver is needed.
const NEUTRAL_STYLE = themeToStyle(DEFAULT_THEME, () => '');

/** Unknown, inactive and empty links all land here, in the neutral theme. */
@Component({
  selector: 'app-not-found',
  host: { class: 'rsvp-page grid min-h-dvh place-items-center', '[style]': 'style' },
  template: `
    <main class="flex max-w-md flex-col items-center gap-4 px-4 text-center">
      <div
        class="grid size-12 place-items-center rounded-full border-2 border-rsvp-border text-2xl font-semibold text-rsvp-muted"
        aria-hidden="true"
      >
        ?
      </div>
      <h1 class="rsvp-heading text-[1.75em] leading-tight text-balance">
        This RSVP page isn't available
      </h1>
      <p class="text-rsvp-muted text-pretty">
        The link may be mistyped, or the host has closed replies for this event. If you think this
        is a mistake, contact the person who invited you.
      </p>
    </main>
  `,
})
export default class NotFound {
  protected readonly style = NEUTRAL_STYLE;

  constructor() {
    loadStylesheet(inject(DOCUMENT), fontStylesheetUrl(DEFAULT_THEME.typography.pairing));
  }
}
