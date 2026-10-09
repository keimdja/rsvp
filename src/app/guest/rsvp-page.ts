import { Component, computed, DOCUMENT, effect, inject, input, resource } from '@angular/core';
import NotFound from '../not-found';
import { publicImageUrl, SUPABASE, type PublicEvent } from '../supabase';
import { fontStylesheetUrl, loadStylesheet, resolveTheme, themeToStyle } from '../theme';

/** Public RSVP page at /:slug. Step 2 wires data and theme; the form arrives in step 3. */
@Component({
  selector: 'app-rsvp-page',
  imports: [NotFound],
  template: `
    @if (event.isLoading()) {
      <p class="sr-only" role="status">Loading invitation…</p>
    } @else if (current(); as ev) {
      <div class="rsvp-page min-h-dvh" [style]="style()">
        <main
          class="mx-4 my-10 flex max-w-140 flex-col gap-3 rounded-rsvp bg-rsvp-surface p-6 sm:mx-auto"
        >
          <h1 class="rsvp-heading text-[2em] leading-tight text-balance">{{ ev.title }}</h1>
          <p class="text-rsvp-muted">{{ ev.event_date }} · {{ ev.start_time.slice(0, 5) }}</p>
        </main>
      </div>
    } @else {
      <app-not-found />
    }
  `,
})
export default class RsvpPage {
  readonly slug = input.required<string>();

  private readonly supabase = inject(SUPABASE);
  private readonly document = inject(DOCUMENT);

  protected readonly event = resource({
    params: () => ({ slug: this.slug() }),
    loader: async ({ params }): Promise<PublicEvent | null> => {
      const { data, error } = await this.supabase
        .rpc('get_public_event', { p_slug: params.slug })
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  protected readonly current = computed(() => (this.event.hasValue() ? this.event.value() : null));
  private readonly theme = computed(() => resolveTheme(this.current()?.theme));
  protected readonly style = computed(() =>
    themeToStyle(this.theme(), (path) => publicImageUrl(this.supabase, path)),
  );

  constructor() {
    effect(() => {
      if (this.current()) {
        loadStylesheet(this.document, fontStylesheetUrl(this.theme().typography.pairing));
      }
    });
  }
}
