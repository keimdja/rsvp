import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { guestLocale, guestTranslator } from '../../i18n';
import { type PublicEvent, type ReplyInput, RESPONSES } from '../../api/models';

/** `bot` is true when the hidden honeypot field was filled in. */
export interface RsvpSubmission {
  draft: ReplyInput;
  bot: boolean;
}

/** Server-side outcomes the form shows; codes match the errors raised by submit_rsvp. */
export type RsvpProblem =
  'invalid_name' | 'notes_required' | 'notes_too_long' | 'rsvp_limit_reached' | 'network';

@Component({
  selector: 'app-rsvp-form',
  templateUrl: './rsvp-form.html',
})
export class RsvpForm {
  readonly event =
    input.required<
      Pick<
        PublicEvent,
        'rsvp_question' | 'button_text' | 'notes_enabled' | 'notes_required' | 'notes_label'
      >
    >();
  /** Prefills the form, e.g. when a guest changes an earlier reply. */
  readonly initial = input<ReplyInput | null>(null);
  readonly pending = input(false);
  readonly problem = input<RsvpProblem | null>(null);
  /** Admin preview: show the empty-form validation state. */
  readonly showErrors = input(false);
  readonly send = output<RsvpSubmission>();

  protected readonly choices = RESPONSES;
  protected readonly t = guestTranslator();
  private readonly locale = guestLocale();

  protected readonly name = linkedSignal(() => this.initial()?.guest_name ?? '');
  protected readonly response = linkedSignal(() => this.initial()?.response ?? null);
  protected readonly notes = linkedSignal(() => this.initial()?.notes ?? '');

  // Field errors come from local validation or from the server, and clear on edit.
  protected readonly nameError = linkedSignal(
    () => this.showErrors() || this.problem() === 'invalid_name',
  );
  protected readonly notesError = linkedSignal(
    () =>
      (this.showErrors() && this.event().notes_enabled && this.event().notes_required) ||
      this.problem() === 'notes_required',
  );
  protected readonly choiceError = linkedSignal(() => this.showErrors());

  protected readonly summary = computed(() => {
    const missing = [
      this.nameError() && this.t('form.missing.name'),
      this.choiceError() && this.t('form.missing.reply'),
      this.notesError() && this.t('form.missing.notes'),
    ].filter((item): item is string => !!item);
    if (missing.length) {
      const items = new Intl.ListFormat(this.locale(), { type: 'conjunction' }).format(missing);
      return this.t('form.summary', { items });
    }
    // Field problems show under their field; the rest get a message here.
    const problem = this.problem();
    return problem && problem !== 'invalid_name' && problem !== 'notes_required'
      ? this.t(`form.problems.${problem}`)
      : null;
  });

  protected submit(event: SubmitEvent, trap: string): void {
    event.preventDefault();
    if (this.pending()) return;

    const { notes_enabled, notes_required } = this.event();
    const guest_name = this.name().trim();
    const response = this.response();
    const notes = notes_enabled ? this.notes().trim() : '';

    this.nameError.set(!guest_name);
    this.choiceError.set(!response);
    this.notesError.set(notes_enabled && notes_required && !notes);
    if (!response || this.nameError() || this.notesError()) return;

    this.send.emit({ draft: { guest_name, response, notes }, bot: trap !== '' });
  }
}
