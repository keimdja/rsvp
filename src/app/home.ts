import { Component, DOCUMENT, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DEFAULT_THEME, fontStylesheetUrl, loadStylesheet, NEUTRAL_STYLE } from './theme';

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
  imports: [RouterLink],
  host: { class: 'rsvp-page @container flow-root min-h-dvh', '[style]': 'style' },
  template: `
    <main
      class="mx-4 mt-30 flex max-w-[560px] flex-col gap-6 rounded-rsvp border border-rsvp-border bg-rsvp-surface px-6 py-8 @3xl:mx-auto @3xl:mt-35 @3xl:p-12"
    >
      <div class="flex flex-col gap-2">
        <h1 class="rsvp-heading text-[calc(28px*var(--rsvp-scale))] leading-[1.15] text-balance">
          Open your invitation
        </h1>
        <p class="text-pretty text-rsvp-muted">
          Paste the link you were sent, or just the invitation code at the end of it.
        </p>
      </div>

      <form class="flex flex-col gap-3" novalidate (submit)="open($event, link.value)">
        <label for="invite-link" class="font-bold">Invitation link or code</label>
        <input
          #link
          id="invite-link"
          class="rsvp-field"
          autocapitalize="off"
          autocomplete="off"
          spellcheck="false"
          placeholder="maya-6"
          [attr.aria-invalid]="!!error()"
          [attr.aria-describedby]="error() ? 'invite-link-error' : null"
          (input)="error.set('')"
        />
        @if (error()) {
          <span id="invite-link-error" class="rsvp-error">{{ error() }}</span>
        }
        <button type="submit" class="rsvp-submit mt-1 min-h-[58px] w-full">Open invitation</button>
      </form>

      <div aria-hidden="true" class="h-px bg-rsvp-border opacity-40"></div>

      <p class="text-rsvp-muted">
        Hosting an event?
        <a routerLink="/admin" class="rsvp-link text-rsvp-text">Sign in to manage events</a>
      </p>
    </main>
  `,
})
export default class Home {
  private readonly router = inject(Router);
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
        value.trim()
          ? "That doesn't look like an invitation link. Check the message you were sent."
          : 'Paste your invitation link or code.',
      );
      return;
    }
    void this.router.navigate(['/', slug]);
  }
}
