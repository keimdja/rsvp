import { Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { I18n, type Language, LANGUAGES } from './i18n';

/**
 * EN / ES switch. Picking a language switches the app and remembers the choice on this
 * device. `appearance="guest"` uses the event theme's colors (landing page, invites).
 */
@Component({
  selector: 'app-language-switch',
  imports: [TranslatePipe],
  template: `
    <div
      role="group"
      [class]="appearance() === 'guest' ? 'rsvp-lang' : 'segmented'"
      [attr.aria-label]="'common.language' | translate"
    >
      @for (lang of languages; track lang) {
        <button
          type="button"
          class="uppercase"
          [attr.lang]="lang"
          [attr.aria-label]="'common.languages.' + lang | translate"
          [attr.aria-pressed]="(current() ?? i18n.current()) === lang"
          (click)="i18n.use(lang, true)"
        >
          {{ lang }}
        </button>
      }
    </div>
  `,
})
export class LanguageSwitch {
  /** The language shown as selected; defaults to the app's language. */
  readonly current = input<Language | null>(null);
  readonly appearance = input<'admin' | 'guest'>('admin');

  protected readonly i18n = inject(I18n);
  protected readonly languages = LANGUAGES;
}
