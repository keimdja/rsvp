import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { I18n, LANGUAGES } from '../i18n';

/** EN / ES switch for the admin UI; the choice is remembered on this device. */
@Component({
  selector: 'app-language-switch',
  imports: [TranslatePipe],
  template: `
    <div class="segmented" role="group" [attr.aria-label]="'admin.language' | translate">
      @for (lang of languages; track lang) {
        <button
          type="button"
          class="uppercase"
          [attr.lang]="lang"
          [attr.aria-label]="'common.languages.' + lang | translate"
          [attr.aria-pressed]="i18n.current() === lang"
          (click)="i18n.use(lang, true)"
        >
          {{ lang }}
        </button>
      }
    </div>
  `,
})
export class LanguageSwitch {
  protected readonly i18n = inject(I18n);
  protected readonly languages = LANGUAGES;
}
