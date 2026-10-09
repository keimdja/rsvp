import { booleanAttribute, Component, computed, input } from '@angular/core';

/**
 * The RSVP mark (docs/design/RSVP Logo.dc.html): three reply choices, one picked.
 * Ink-only, so it never competes with an event's theme. `lockup` adds the wordmark.
 * Sized by height; small sizes get the design's thicker rings so they stay visible.
 */
@Component({
  selector: 'app-logo',
  host: { class: 'inline-flex shrink-0' },
  template: `
    <svg
      [attr.viewBox]="lockup() ? '0 0 220 64' : '0 0 64 64'"
      [attr.height]="size()"
      [attr.width]="lockup() ? (size() * 220) / 64 : size()"
      role="img"
      aria-label="RSVP"
    >
      <rect width="64" height="64" rx="15" fill="#1c1c1a" />
      <circle cx="15" cy="32" r="6" fill="#fff" />
      <circle cx="32" cy="32" r="4.5" fill="none" stroke="#fff" [attr.stroke-width]="ring()" />
      <circle cx="49" cy="32" r="4.5" fill="none" stroke="#fff" [attr.stroke-width]="ring()" />
      @if (lockup()) {
        <text
          x="82"
          y="44"
          font-family="'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif"
          font-size="34"
          font-weight="600"
          letter-spacing="-0.5"
          fill="#1c1c1a"
        >
          rsvp
        </text>
      }
    </svg>
  `,
})
export class Logo {
  /** Height in px. */
  readonly size = input(24);
  readonly lockup = input(false, { transform: booleanAttribute });

  protected readonly ring = computed(() => (this.size() <= 16 ? 4 : this.size() <= 24 ? 3.5 : 2.5));
}
