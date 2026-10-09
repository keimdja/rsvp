import {
  booleanAttribute,
  Component,
  computed,
  DOCUMENT,
  effect,
  inject,
  input,
} from '@angular/core';
import { publicImageUrl, SUPABASE, type PublicEvent } from '../supabase';
import { fontStylesheetUrl, loadStylesheet, themeToStyle, type EventTheme } from '../theme';
import { formatWhen, mapsUrl } from './calendar';

// Classes per layout, from the design: card = invite on top and details in a centered card;
// poster = invite fills the first screen and the card rises over it. Breakpoints are
// container queries (@3xl = 768px of the invite's own width) and screen heights read
// --rsvp-screen, so the admin's phone-sized preview renders exactly like a phone.
const LAYOUT = {
  card: {
    shell:
      'mx-auto flex max-w-[600px] flex-col gap-4 pt-[max(16px,env(safe-area-inset-top))] pr-[max(16px,env(safe-area-inset-right))] pb-[calc(40px+env(safe-area-inset-bottom))] pl-[max(16px,env(safe-area-inset-left))] @3xl:max-w-[560px] @3xl:gap-5 @3xl:px-0 @3xl:pt-16 @3xl:pb-30',
    hero: 'overflow-hidden rounded-rsvp bg-rsvp-hero-tint shadow-[0_12px_40px_-16px_rgb(0_0_0/0.35)]',
    image: 'h-auto',
    card: '',
  },
  poster: {
    shell: 'pb-[calc(40px+env(safe-area-inset-bottom))] @3xl:pb-30',
    hero: 'h-[calc(var(--rsvp-screen,100svh)*0.88)] w-full bg-rsvp-hero-tint @3xl:h-[calc(var(--rsvp-screen,100vh)*0.92)]',
    image: 'h-full',
    card: 'mx-3 @3xl:mx-auto @3xl:w-[640px]',
    cardOverHero: '-mt-22 @3xl:-mt-50',
    cardNoHero: 'mt-[max(24px,env(safe-area-inset-top))] @3xl:mt-16',
  },
};

/**
 * The themed invitation: background, hero, card with the event details, and a slot
 * for the form or confirmation. Pure rendering, shared by the guest page and the
 * admin live preview.
 */
@Component({
  selector: 'app-invite',
  host: {
    class:
      'rsvp-page @container relative isolate block min-h-[var(--rsvp-screen,100dvh)] overflow-hidden',
    '[attr.role]': "framed() ? null : 'main'",
    '[style]': 'style()',
    '[attr.data-card]': 'theme().card.style',
    '[attr.data-button]': 'theme().button.style',
  },
  template: `
    @let ev = event();
    @let poster = theme().layout === 'poster';
    @let css = classes();
    @if (theme().background.kind === 'image') {
      <div
        aria-hidden="true"
        class="absolute -inset-6 -z-10 bg-(image:--rsvp-bg-image) bg-cover bg-center blur-(--rsvp-blur)"
      ></div>
      <div aria-hidden="true" class="absolute inset-0 -z-10 bg-(--rsvp-overlay)"></div>
    }

    <div [class]="css.shell">
      @if (heroUrl(); as src) {
        <div [class]="css.hero">
          <img
            [src]="src"
            [alt]="theme().hero.alt"
            fetchpriority="high"
            class="block w-full"
            [class]="css.image"
            [class.object-cover]="poster && theme().hero.fit === 'cover'"
            [class.object-contain]="poster && theme().hero.fit === 'contain'"
          />
        </div>
      }

      <div
        class="rsvp-card relative flex flex-col gap-7 rounded-rsvp @3xl:gap-9"
        [class]="css.card"
      >
        <div class="flex flex-col gap-5">
          <h1
            class="rsvp-heading text-[calc(38px*var(--rsvp-scale))] leading-[1.02] tracking-[-0.01em] text-balance @3xl:text-[calc(54px*var(--rsvp-scale))]"
          >
            {{ ev.title }}
          </h1>

          <dl class="flex flex-col gap-4">
            <div class="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-3">
              <dt class="text-xs font-bold tracking-[0.09em] text-rsvp-muted uppercase">When</dt>
              <dd class="flex flex-col gap-0.5">
                <span class="font-bold">{{ when().date }}</span>
                <span class="text-rsvp-muted">{{ when().time }}</span>
              </dd>
            </div>
            @if (ev.location_name || ev.location_address) {
              <div class="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-3">
                <dt class="text-xs font-bold tracking-[0.09em] text-rsvp-muted uppercase">Where</dt>
                <dd class="flex flex-col items-start gap-0.5">
                  @if (ev.location_name) {
                    <span class="font-bold">{{ ev.location_name }}</span>
                  }
                  @if (ev.location_address) {
                    <span class="text-rsvp-muted">{{ ev.location_address }}</span>
                  }
                  <a
                    class="rsvp-link inline-flex min-h-11 items-center gap-1.5"
                    [href]="mapsHref()"
                    target="_blank"
                    rel="noopener"
                  >
                    Open in Maps <span aria-hidden="true">↗</span>
                  </a>
                </dd>
              </div>
            }
          </dl>

          @if (ev.description) {
            <p class="whitespace-pre-line text-pretty">{{ ev.description }}</p>
          }
        </div>

        <div aria-hidden="true" class="h-0.5 w-14 rounded-xs bg-rsvp-accent"></div>

        <ng-content />
      </div>
    </div>
  `,
})
export class Invite {
  readonly event = input.required<PublicEvent>();
  readonly theme = input.required<EventTheme>();
  /** Rendered inside the admin preview: the page is not the document's main landmark. */
  readonly framed = input(false, { transform: booleanAttribute });

  private readonly supabase = inject(SUPABASE);
  private readonly document = inject(DOCUMENT);

  private readonly imageUrl = (path: string) => publicImageUrl(this.supabase, path);

  protected readonly style = computed(() => themeToStyle(this.theme(), this.imageUrl));
  protected readonly when = computed(() => formatWhen(this.event()));
  protected readonly heroUrl = computed(() => {
    const path = this.theme().hero.imagePath;
    return path ? this.imageUrl(path) : null;
  });
  protected readonly classes = computed(() => {
    if (this.theme().layout === 'card') return LAYOUT.card;
    const { cardOverHero, cardNoHero, ...poster } = LAYOUT.poster;
    return { ...poster, card: `${poster.card} ${this.heroUrl() ? cardOverHero : cardNoHero}` };
  });
  protected readonly mapsHref = computed(() => {
    const { location_address, location_name } = this.event();
    return mapsUrl(location_address || location_name || '');
  });

  constructor() {
    effect(() => loadStylesheet(this.document, fontStylesheetUrl(this.theme().typography.pairing)));
  }
}
