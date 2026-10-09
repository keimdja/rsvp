import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { RESPONSE_LABELS, type PublicEvent, type RsvpResponse } from '../supabase';

export interface RsvpDraft {
  guest_name: string;
  response: RsvpResponse;
  notes: string;
}

/** `bot` is true when the hidden honeypot field was filled in. */
export interface RsvpSubmission {
  draft: RsvpDraft;
  bot: boolean;
}

/** Server-side outcomes the form shows; codes match the errors raised by submit_rsvp. */
export type RsvpProblem =
  'invalid_name' | 'notes_required' | 'notes_too_long' | 'rsvp_limit_reached' | 'network';

const CHOICES = (Object.keys(RESPONSE_LABELS) as RsvpResponse[]).map((value) => ({
  value,
  label: RESPONSE_LABELS[value],
}));

const PROBLEM_MESSAGES: Partial<Record<RsvpProblem, string>> = {
  notes_too_long: 'Please keep your note under 1,000 characters.',
  rsvp_limit_reached: "Sorry, this event isn't taking more replies.",
  network: "We couldn't send your reply. Check your connection and try again.",
};

const listFormat = new Intl.ListFormat('en', { type: 'conjunction' });

@Component({
  selector: 'app-rsvp-form',
  template: `
    @let ev = event();
    <form
      class="relative flex flex-col gap-[26px]"
      novalidate
      (submit)="submit($event, trap.value)"
    >
      @if (summary(); as message) {
        <div
          role="alert"
          class="flex items-start gap-2.5 rounded-(--rsvp-field-radius) border-2 border-rsvp-error px-3.5 py-3 font-semibold"
        >
          <span aria-hidden="true" class="font-extrabold text-rsvp-error">!</span>
          <span>{{ message }}</span>
        </div>
      }

      <div class="flex flex-col gap-2">
        <label for="rsvp-name" class="font-bold">Your name</label>
        <input
          #nameInput
          id="rsvp-name"
          class="rsvp-field"
          autocomplete="name"
          maxlength="100"
          placeholder="First and last name"
          aria-required="true"
          [value]="name()"
          [disabled]="pending()"
          [attr.aria-invalid]="nameError()"
          [attr.aria-describedby]="nameError() ? 'rsvp-name-error' : null"
          (input)="name.set(nameInput.value); nameError.set(false)"
        />
        @if (nameError()) {
          <span id="rsvp-name-error" class="rsvp-error">
            Add your name so the host knows who's replying.
          </span>
        }
      </div>

      <fieldset
        class="flex min-w-0 flex-col gap-3"
        [attr.aria-describedby]="choiceError() ? 'rsvp-choice-error' : null"
      >
        <legend class="rsvp-heading mb-3 text-[calc(24px*var(--rsvp-scale))] leading-[1.15]">
          {{ ev.rsvp_question }}
        </legend>
        <div class="grid grid-cols-3 gap-2">
          @for (choice of choices; track choice.value) {
            @let checked = response() === choice.value;
            <label
              class="rsvp-choice flex min-h-[68px] flex-col items-center justify-center gap-1 px-1 py-2 text-[max(16px,1em)] font-extrabold @3xl:min-h-[76px]"
            >
              <input
                type="radio"
                name="response"
                class="sr-only"
                [value]="choice.value"
                [checked]="checked"
                [disabled]="pending()"
                [attr.aria-invalid]="choiceError()"
                (change)="response.set(choice.value); choiceError.set(false)"
              />
              <span aria-hidden="true" class="text-lg leading-none">{{ checked ? '✓' : '○' }}</span>
              <span>{{ choice.label }}</span>
            </label>
          }
        </div>
        @if (choiceError()) {
          <span id="rsvp-choice-error" class="rsvp-error">Choose Yes, Maybe or No.</span>
        }
      </fieldset>

      @if (ev.notes_enabled) {
        <div class="flex flex-col gap-2">
          <label for="rsvp-notes" class="flex flex-wrap items-baseline gap-2">
            <span class="font-bold">{{ ev.notes_label }}</span>
            <span class="text-[13px] font-semibold text-rsvp-muted">
              {{ ev.notes_required ? 'Required' : 'Optional' }}
            </span>
          </label>
          <textarea
            #notesInput
            id="rsvp-notes"
            class="rsvp-field min-h-24 resize-y"
            rows="3"
            maxlength="1000"
            [value]="notes()"
            [disabled]="pending()"
            [attr.aria-required]="ev.notes_required"
            [attr.aria-invalid]="notesError()"
            [attr.aria-describedby]="notesError() ? 'rsvp-notes-error' : null"
            (input)="notes.set(notesInput.value); notesError.set(false)"
          ></textarea>
          @if (notesError()) {
            <span id="rsvp-notes-error" class="rsvp-error">
              This one's required. Write "none" if it doesn't apply.
            </span>
          }
        </div>
      }

      <!-- Honeypot: invisible to people, tempting to bots. -->
      <div aria-hidden="true" class="absolute -left-[10000px] size-px overflow-hidden">
        <label
          >Leave this empty <input #trap name="website" tabindex="-1" autocomplete="off"
        /></label>
      </div>

      <div class="flex flex-col gap-3">
        <button
          type="submit"
          class="rsvp-submit flex min-h-[58px] w-full items-center justify-center gap-2.5"
          [class.opacity-85]="pending()"
          [disabled]="pending()"
          [attr.aria-busy]="pending()"
        >
          @if (pending()) {
            <span
              aria-hidden="true"
              class="size-[18px] animate-spin rounded-full border-[2.5px] border-current border-r-transparent"
            ></span>
            <span>Sending…</span>
          } @else {
            {{ ev.button_text }}
          }
        </button>
        <p class="text-center text-sm text-rsvp-muted">Only the host sees your reply.</p>
      </div>
    </form>
  `,
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
  readonly initial = input<RsvpDraft | null>(null);
  readonly pending = input(false);
  readonly problem = input<RsvpProblem | null>(null);
  /** Admin preview: show the empty-form validation state. */
  readonly showErrors = input(false);
  readonly send = output<RsvpSubmission>();

  protected readonly choices = CHOICES;

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
      this.nameError() && 'your name',
      this.choiceError() && 'a reply',
      this.notesError() && 'the notes field',
    ].filter((item): item is string => !!item);
    if (missing.length) return `Please add ${listFormat.format(missing)}.`;
    const problem = this.problem();
    return problem ? (PROBLEM_MESSAGES[problem] ?? null) : null;
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
