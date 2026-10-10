import {
  booleanAttribute,
  Component,
  computed,
  DOCUMENT,
  effect,
  inject,
  input,
} from '@angular/core';
import type { PublicEvent } from '../../api/models';
import { PublicApi } from '../../api/public-api';
import { fontStylesheetUrl, loadStylesheet, themeToStyle, type EventTheme } from '../../theme';
import { NgTemplateOutlet } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { EVENT_LANGUAGE, I18n, isLanguage, type Language, LOCALES } from '../../i18n';
import { LanguageSwitch } from '../../language-switch/language-switch';
import { formatWhen, mapsUrl } from '../calendar';

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
  imports: [LanguageSwitch, NgTemplateOutlet],
  // `providers` (not viewProviders) so projected form/confirmation content sees it too.
  providers: [{ provide: EVENT_LANGUAGE, useFactory: () => inject(Invite).language }],
  host: {
    class:
      'rsvp-page @container relative isolate block min-h-[var(--rsvp-screen,100dvh)] overflow-hidden',
    '[attr.role]': "framed() ? null : 'main'",
    '[attr.lang]': 'language()',
    '[style]': 'style()',
    '[attr.data-card]': 'theme().card.style',
    '[attr.data-button]': 'theme().button.style',
  },
  templateUrl: './invite.html',
})
export class Invite {
  readonly event = input.required<PublicEvent>();
  readonly theme = input.required<EventTheme>();
  /** Rendered inside the admin preview: the page is not the document's main landmark. */
  readonly framed = input(false, { transform: booleanAttribute });

  private readonly api = inject(PublicApi);
  private readonly document = inject(DOCUMENT);

  private readonly i18n = inject(I18n);
  private readonly translate = inject(TranslateService);
  /**
   * Translates in the event's language. Not guestTranslator(): that injects
   * EVENT_LANGUAGE, which this component provides, so injecting it here is circular.
   */
  protected readonly t = (key: string) =>
    this.translate.instant(key, undefined, this.language()) as string;

  /**
   * The language for default text and dates: a language the guest picked with the
   * switch, else the event's own. The admin preview always shows the event's own.
   * Guest components inside read it through EVENT_LANGUAGE.
   */
  readonly language = computed<Language>(() => {
    const own = this.event().language;
    const eventLanguage = isLanguage(own) ? own : 'en';
    return this.framed() ? eventLanguage : (this.i18n.chosen() ?? eventLanguage);
  });

  private readonly imageUrl = (path: string) => this.api.imageUrl(path);

  protected readonly style = computed(() => themeToStyle(this.theme(), this.imageUrl));
  protected readonly when = computed(() => formatWhen(this.event(), LOCALES[this.language()]));
  protected readonly heroUrl = computed(() => {
    const path = this.theme().hero.imagePath;
    return path ? this.imageUrl(path) : null;
  });
  protected readonly classes = computed(() => {
    if (this.theme().layout === 'card') return LAYOUT.card;
    const { cardOverHero, cardNoHero, ...poster } = LAYOUT.poster;
    return { ...poster, card: `${poster.card} ${this.heroUrl() ? cardOverHero : cardNoHero}` };
  });
  /** The host's own map link when given, else a map search for the address. */
  protected readonly mapsHref = computed(() => {
    const { location_url, location_address, location_name } = this.event();
    return location_url || mapsUrl(location_address || location_name || '');
  });

  constructor() {
    effect(() => loadStylesheet(this.document, fontStylesheetUrl(this.theme().typography.pairing)));
    effect(() => void this.i18n.load(this.language()));
  }
}
