import {
  Component,
  computed,
  DOCUMENT,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import NotFound from '../not-found';
import { TranslatePipe } from '@ngx-translate/core';
import { I18n, isLanguage } from '../i18n';
import {
  ApiError,
  type PublicEvent,
  type ReplyInput,
  RESPONSES,
  type RsvpResponse,
} from '../api/models';
import { PublicApi } from '../api/public-api';
import { NEUTRAL_STYLE, resolveTheme } from '../theme';
import { Invite } from './invite';
import { RsvpConfirmation } from './rsvp-confirmation';
import { RsvpForm, type RsvpProblem, type RsvpSubmission } from './rsvp-form';

/** A guest's reply, kept in their browser so "Change my reply" can edit it. */
interface SavedReply extends ReplyInput {
  token: string; // edit token from submit_rsvp; empty for replies that never reached the server
}

const storageKey = (slug: string) => `rsvp:${slug}`;

function readReply(slug: string): SavedReply | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(slug)) ?? 'null');
    const reply = value as SavedReply | null;
    const valid =
      typeof reply?.token === 'string' &&
      typeof reply.guest_name === 'string' &&
      typeof reply.notes === 'string' &&
      RESPONSES.includes(reply.response as RsvpResponse);
    return valid ? reply : null;
  } catch {
    return null; // storage blocked (private mode, in-app browser) or corrupt
  }
}

function writeReply(slug: string, reply: SavedReply): void {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(reply));
  } catch {
    // Without storage the reply still counts; only "Change my reply" across visits is lost.
  }
}

const KNOWN_PROBLEMS = new Set<string>([
  'invalid_name',
  'notes_required',
  'notes_too_long',
  'rsvp_limit_reached',
]);

/** Public RSVP page at /:slug. */
@Component({
  selector: 'app-rsvp-page',
  imports: [Invite, NotFound, RsvpConfirmation, RsvpForm, TranslatePipe],
  template: `
    @if (event.status() === 'loading') {
      <div class="rsvp-page min-h-dvh" [style]="neutralStyle" aria-busy="true">
        <p role="status" class="sr-only">{{ 'guest.loading' | translate }}</p>
        <div
          aria-hidden="true"
          class="mx-auto flex max-w-[600px] flex-col gap-4 p-4 md:max-w-[560px] md:gap-5 md:px-0 md:pt-16"
        >
          <div class="aspect-4/5 w-full rounded-[20px] bg-rsvp-skel"></div>
          <div class="flex flex-col gap-6 rounded-[20px] bg-rsvp-surface px-[22px] py-[30px]">
            <div class="h-[34px] w-[72%] rounded-lg bg-rsvp-skel"></div>
            <div class="flex flex-col gap-2.5">
              <div class="h-3.5 w-[58%] rounded-md bg-rsvp-skel"></div>
              <div class="h-3.5 w-[40%] rounded-md bg-rsvp-skel"></div>
            </div>
            <div class="h-[52px] rounded-xl bg-rsvp-skel"></div>
            <div class="grid grid-cols-3 gap-2">
              <div class="h-16 rounded-xl bg-rsvp-skel"></div>
              <div class="h-16 rounded-xl bg-rsvp-skel"></div>
              <div class="h-16 rounded-xl bg-rsvp-skel"></div>
            </div>
            <div class="h-14 rounded-xl bg-rsvp-skel"></div>
          </div>
        </div>
      </div>
    } @else if (current(); as ev) {
      <app-invite [event]="ev" [theme]="theme()">
        @if (showConfirmation() && saved(); as reply) {
          <app-rsvp-confirmation
            [event]="ev"
            [reply]="reply"
            [pageUrl]="pageUrl"
            [focusOnShow]="justSent()"
            (edit)="editing.set(true)"
          />
        } @else {
          <app-rsvp-form
            [event]="ev"
            [initial]="saved()"
            [pending]="pending()"
            [problem]="problem()"
            (send)="submit($event)"
          />
        }
      </app-invite>
    } @else if (event.error()) {
      <app-not-found
        [heading]="'guest.loadErrorTitle' | translate"
        [message]="'guest.loadErrorMessage' | translate"
      >
        <button type="button" class="rsvp-link min-h-11 self-start" (click)="event.reload()">
          {{ 'common.tryAgain' | translate }}
        </button>
      </app-not-found>
    } @else {
      <app-not-found />
    }
  `,
})
export default class RsvpPage {
  readonly slug = input.required<string>();

  private readonly api = inject(PublicApi);
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly i18n = inject(I18n);

  protected readonly neutralStyle = NEUTRAL_STYLE;
  protected readonly pageUrl = this.document.location.href.split(/[?#]/)[0];

  protected readonly event = resource({
    params: () => ({ slug: this.slug() }),
    loader: async ({ params }): Promise<PublicEvent | null> => {
      const data = await this.api.getEvent(params.slug);
      // Load the event's language before rendering, so labels never flash untranslated.
      if (data) await this.i18n.load(isLanguage(data.language) ? data.language : 'en');
      return data;
    },
  });

  protected readonly current = computed(() => (this.event.hasValue() ? this.event.value() : null));
  protected readonly theme = computed(() => resolveTheme(this.current()?.theme));

  protected readonly saved = linkedSignal(() => readReply(this.slug()));
  protected readonly editing = linkedSignal({ source: this.saved, computation: () => false });
  protected readonly showConfirmation = computed(() => !!this.saved() && !this.editing());
  protected readonly justSent = signal(false);
  protected readonly pending = signal(false);
  protected readonly problem = signal<RsvpProblem | null>(null);

  constructor() {
    effect(() => {
      const title = this.current()?.title;
      if (title) this.title.setTitle(title);
    });
  }

  protected async submit({ draft, bot }: RsvpSubmission): Promise<void> {
    this.problem.set(null);
    if (bot) {
      // Look successful to the bot, but send and store nothing.
      this.saved.set({ ...draft, token: '' });
      return;
    }

    this.pending.set(true);
    let token: string;
    try {
      token = await this.api.submitReply(this.slug(), draft, this.saved()?.token);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'network';
      if (code === 'event_unavailable') {
        this.event.reload(); // closed or removed meanwhile: show "not available"
      } else {
        this.problem.set(KNOWN_PROBLEMS.has(code) ? (code as RsvpProblem) : 'network');
      }
      return;
    } finally {
      this.pending.set(false);
    }

    const reply: SavedReply = { ...draft, token };
    writeReply(this.slug(), reply);
    this.justSent.set(true);
    this.saved.set(reply);
  }
}
