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
import NotFound from '../../not-found/not-found';
import { TranslatePipe } from '@ngx-translate/core';
import { I18n, isLanguage } from '../../i18n';
import {
  ApiError,
  type PublicEvent,
  type ReplyInput,
  RESPONSES,
  type RsvpResponse,
} from '../../api/models';
import { PublicApi } from '../../api/public-api';
import { NEUTRAL_STYLE, resolveTheme } from '../../theme';
import { Invite } from '../invite/invite';
import { RsvpConfirmation } from '../rsvp-confirmation/rsvp-confirmation';
import { RsvpForm, type RsvpProblem, type RsvpSubmission } from '../rsvp-form/rsvp-form';

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
  templateUrl: './rsvp-page.html',
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
