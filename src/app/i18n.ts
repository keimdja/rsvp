import { DOCUMENT, inject, Injectable, InjectionToken, type Signal, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { type RouterStateSnapshot, TitleStrategy } from '@angular/router';
import {
  type InterpolationParameters,
  TranslateLoader,
  TranslateService,
} from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

// UI languages. Translations live in public/i18n/<language>.json.
export const LANGUAGES = ['en', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Locale used for dates and lists in each language. */
export const LOCALES: Record<Language, string> = { en: 'en-US', es: 'es-PR' };

const STORAGE_KEY = 'rsvp:language';

export const isLanguage = (value: unknown): value is Language =>
  LANGUAGES.includes(value as Language);

/**
 * The app's language (admin, landing and "not available" pages): the visitor's saved
 * choice, else the browser language, else English. Invites use the visitor's saved
 * choice, else the event's own language (see Invite).
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly translate = inject(TranslateService);
  private readonly loader = inject(TranslateLoader);
  private readonly document = inject(DOCUMENT);
  private readonly loading = new Map<Language, Promise<void>>();

  readonly current = this.translate.currentLang as Signal<Language | null>;
  /** A language the visitor picked with the EN/ES switch (remembered on this device). */
  readonly chosen = signal<Language | null>(null);

  /** App initializer: load the starting language before the first render. */
  init(): Promise<void> {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isLanguage(saved)) this.chosen.set(saved);
    } catch {
      // storage blocked: fall back to the browser language
    }
    const browser = this.translate.getBrowserLang();
    return this.use(this.chosen() ?? (isLanguage(browser) ? browser : 'en'));
  }

  async use(language: Language, remember = false): Promise<void> {
    await this.load(language);
    await firstValueFrom(this.translate.use(language));
    this.document.documentElement.lang = language;
    if (remember) {
      this.chosen.set(language);
      try {
        localStorage.setItem(STORAGE_KEY, language);
      } catch {
        // the choice still applies for this visit
      }
    }
  }

  /** Loads a language's translations without switching to it (used for event pages). */
  load(language: Language): Promise<void> {
    if (!this.loading.has(language)) {
      const request = firstValueFrom(this.loader.getTranslation(language)).then((data) =>
        this.translate.setTranslation(language, data),
      );
      request.catch(() => this.loading.delete(language)); // let a later call retry
      this.loading.set(language, request);
    }
    return this.loading.get(language)!;
  }
}

/** The language of the event being rendered; provided by the invite component. */
export const EVENT_LANGUAGE = new InjectionToken<Signal<Language>>('EVENT_LANGUAGE');

/**
 * Translate function for guest components: uses the event's language when inside an
 * invite (so the admin preview shows the event's language), else the app's language.
 * Reactive: templates re-render when translations or the language change.
 */
export function guestTranslator() {
  const translate = inject(TranslateService);
  const language = inject(EVENT_LANGUAGE, { optional: true });
  return (key: string, params?: InterpolationParameters): string =>
    translate.instant(key, params, language?.() ?? undefined) as string;
}

/** The locale for the current guest or app language. */
export function guestLocale(): () => string {
  const translate = inject(TranslateService);
  const language = inject(EVENT_LANGUAGE, { optional: true });
  return () => {
    const lang = language?.() ?? translate.currentLang();
    return LOCALES[isLanguage(lang) ? lang : 'en'];
  };
}

/**
 * Starting wording for new events, per language. The English values match the
 * database column defaults. Switching an event's language replaces only fields that
 * still hold the other language's default.
 */
export const DEFAULT_WORDING: Record<
  Language,
  { rsvp_question: string; button_text: string; confirmation_message: string; notes_label: string }
> = {
  en: {
    rsvp_question: 'Will you be joining us?',
    button_text: 'Send RSVP',
    confirmation_message: "Thank you! We can't wait to see you.",
    notes_label: 'Anything we should know?',
  },
  es: {
    rsvp_question: '¿Nos acompañas?',
    button_text: 'Enviar respuesta',
    confirmation_message: '¡Gracias! Te esperamos.',
    notes_label: '¿Algo que debamos saber?',
  },
};

/** Route `title`s are translation keys; pages with their own title (events) set it themselves. */
@Injectable()
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly translate = inject(TranslateService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const key = this.buildTitle(snapshot);
    if (key) this.title.setTitle(this.translate.instant(key) as string);
  }
}
