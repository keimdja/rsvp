import { Component, DOCUMENT, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DEFAULT_THEME, fontStylesheetUrl, loadStylesheet, NEUTRAL_STYLE } from '../theme';

/** Unknown, inactive and empty links land here, in the neutral theme. */
@Component({
  selector: 'app-not-found',
  imports: [TranslatePipe],
  host: {
    class: 'rsvp-page @container flow-root min-h-[var(--rsvp-screen,100dvh)]',
    '[style]': 'style',
  },
  templateUrl: './not-found.html',
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
