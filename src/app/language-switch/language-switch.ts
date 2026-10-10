import { Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { I18n, type Language, LANGUAGES } from '../i18n';

/**
 * EN / ES switch. Picking a language switches the app and remembers the choice on this
 * device. `appearance="guest"` uses the event theme's colors (landing page, invites).
 */
@Component({
  selector: 'app-language-switch',
  imports: [TranslatePipe],
  templateUrl: './language-switch.html',
})
export class LanguageSwitch {
  /** The language shown as selected; defaults to the app's language. */
  readonly current = input<Language | null>(null);
  readonly appearance = input<'admin' | 'guest'>('admin');

  protected readonly i18n = inject(I18n);
  protected readonly languages = LANGUAGES;
}
