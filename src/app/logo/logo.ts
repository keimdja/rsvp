import { booleanAttribute, Component, computed, input } from '@angular/core';

/**
 * The RSVP mark (docs/design/RSVP Logo.dc.html): three reply choices, one picked.
 * Ink-only, so it never competes with an event's theme. `lockup` adds the wordmark.
 * Sized by height; small sizes get the design's thicker rings so they stay visible.
 */
@Component({
  selector: 'app-logo',
  host: { class: 'inline-flex shrink-0' },
  templateUrl: './logo.html',
})
export class Logo {
  /** Height in px. */
  readonly size = input(24);
  readonly lockup = input(false, { transform: booleanAttribute });

  protected readonly ring = computed(() => (this.size() <= 16 ? 4 : this.size() <= 24 ? 3.5 : 2.5));
}
