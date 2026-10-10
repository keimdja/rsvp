import { Component, DOCUMENT, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageSwitch } from '../language-switch/language-switch';
import { Logo } from '../logo/logo';
import { DEFAULT_THEME, fontStylesheetUrl, loadStylesheet, NEUTRAL_STYLE } from '../theme';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Reads an invitation code from what a guest pastes: a full link, a link without the
 * scheme, or just the code. `basePath` is where the app lives (e.g. "/rsvp/").
 */
export function slugFromInput(value: string, basePath = '/'): string | null {
  const segments = value.trim().split(/[?#]/)[0].split('/').filter(Boolean);
  const hasScheme = !!segments[0]?.endsWith(':'); // https:
  if (hasScheme) segments.shift();
  if (segments.length > 1 && (hasScheme || segments[0].includes('.'))) segments.shift(); // host
  for (const base of basePath.split('/').filter(Boolean)) {
    if (segments[0] === base && segments.length > 1) segments.shift();
    else if (segments[0] === base) return null; // the site itself, no code
  }
  const slug = segments.length === 1 ? segments[0].toLowerCase() : '';
  return SLUG.test(slug) && slug.length >= 3 && slug.length <= 64 ? slug : null;
}

/** Landing page at the site root: guests open their invitation, hosts go to sign in. */
@Component({
  selector: 'app-home',
  imports: [LanguageSwitch, Logo, RouterLink, TranslatePipe],
  host: { class: 'rsvp-page @container relative flow-root min-h-dvh', '[style]': 'style' },
  templateUrl: './home.html',
})
export default class Home {
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);

  protected readonly style = NEUTRAL_STYLE;
  protected readonly error = signal('');

  constructor() {
    loadStylesheet(this.document, fontStylesheetUrl(DEFAULT_THEME.typography.pairing));
  }

  protected open(event: SubmitEvent, value: string): void {
    event.preventDefault();
    const slug = slugFromInput(value, new URL(this.document.baseURI).pathname);
    if (!slug) {
      this.error.set(
        this.translate.instant(value.trim() ? 'home.errorInvalid' : 'home.errorEmpty'),
      );
      return;
    }
    void this.router.navigate(['/', slug]);
  }
}
