import {
  Component,
  computed,
  DOCUMENT,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { type EventRow, IMAGE_BUCKET, type PublicEvent, SUPABASE } from '../supabase';
import { type EventTheme, resolveTheme } from '../theme';
import { EventPreview } from './event-preview';
import { LookEditor } from './look-editor';
import { AdminUi } from './ui';

/** Editable event fields. Optional text columns are '' here and null in the database. */
interface Draft {
  title: string;
  slug: string;
  description: string;
  event_date: string;
  start_time: string;
  end_time: string;
  timezone: string;
  location_name: string;
  location_address: string;
  rsvp_question: string;
  button_text: string;
  confirmation_message: string;
  notes_label: string;
  notes_enabled: boolean;
  notes_required: boolean;
  is_active: boolean;
  theme: EventTheme;
}
type Field = keyof Draft;
type Tab = 'details' | 'wording' | 'rsvp' | 'look';

const TABS: { value: Tab; label: string }[] = [
  { value: 'details', label: 'Details' },
  { value: 'wording', label: 'Wording' },
  { value: 'rsvp', label: 'RSVP' },
  { value: 'look', label: 'Look' },
];

const TIME_ZONES = [
  'America/Puerto_Rico',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney',
];

const RESERVED_SLUGS = ['admin', 'login', 'assets', 'index']; // matches the database check
const hhmm = (time: string | null) => time?.slice(0, 5) ?? '';

function toDraft(row: EventRow): Draft {
  return {
    title: row.title,
    slug: row.slug,
    description: row.description ?? '',
    event_date: row.event_date,
    start_time: hhmm(row.start_time),
    end_time: hhmm(row.end_time),
    timezone: row.timezone,
    location_name: row.location_name ?? '',
    location_address: row.location_address ?? '',
    rsvp_question: row.rsvp_question,
    button_text: row.button_text,
    confirmation_message: row.confirmation_message,
    notes_label: row.notes_label,
    notes_enabled: row.notes_enabled,
    notes_required: row.notes_required,
    is_active: row.is_active,
    theme: resolveTheme(row.theme),
  };
}

function toRow(d: Draft) {
  const optional = (value: string) => value.trim() || null;
  return {
    title: d.title.trim(),
    slug: d.slug,
    description: optional(d.description),
    event_date: d.event_date,
    start_time: d.start_time,
    end_time: d.end_time || null,
    timezone: d.timezone,
    location_name: optional(d.location_name),
    location_address: optional(d.location_address),
    rsvp_question: d.rsvp_question.trim(),
    button_text: d.button_text.trim(),
    confirmation_message: d.confirmation_message.trim(),
    notes_label: d.notes_label.trim(),
    notes_enabled: d.notes_enabled,
    notes_required: d.notes_enabled && d.notes_required,
    is_active: d.is_active,
    theme: { ...d.theme },
  };
}

function validate(d: Draft): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (!d.title.trim()) errors.title = 'Give the event a title.';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.slug)) {
    errors.slug = 'Use lowercase letters, numbers and single hyphens.';
  } else if (d.slug.length < 3 || d.slug.length > 64) {
    errors.slug = 'Use 3 to 64 characters.';
  } else if (RESERVED_SLUGS.includes(d.slug)) {
    errors.slug = 'This link is reserved. Pick another.';
  }
  if (!d.event_date) errors.event_date = 'Pick a date.';
  if (!d.start_time) errors.start_time = 'Pick a start time.';
  for (const field of [
    'rsvp_question',
    'button_text',
    'confirmation_message',
    'notes_label',
  ] as const) {
    if (!d[field].trim()) errors[field] = "This can't be empty.";
  }
  return errors;
}

const tabOf = (field: Field): Tab =>
  ['rsvp_question', 'button_text', 'confirmation_message', 'notes_label', 'description'].includes(
    field,
  )
    ? 'wording'
    : 'details';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 64);

const themePaths = (theme: EventTheme) =>
  [theme.hero.imagePath, theme.background.imagePath].filter((p): p is string => !!p);

@Component({
  selector: 'app-event-editor',
  imports: [RouterLink, EventPreview, LookEditor],
  host: { '(window:beforeunload)': 'warnBeforeUnload($event)' },
  template: `
    @if (event.isLoading() && !event.hasValue()) {
      <p class="p-4 text-muted" role="status">Loading event…</p>
    } @else if (event.error()) {
      <div class="panel m-4 flex flex-col items-start gap-3 p-6">
        <p>Couldn't load the event. Check your connection.</p>
        <button type="button" class="btn" (click)="event.reload()">Try again</button>
      </div>
    } @else if (draft(); as d) {
      <div class="border-b border-line bg-white">
        <div
          class="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-4 gap-y-3 p-4"
        >
          <div class="flex min-w-0 flex-col gap-1">
            <a routerLink="/admin" class="text-[13px] text-muted">← Events</a>
            <div class="flex min-w-0 items-center gap-2.5">
              <h1 class="truncate text-[22px] leading-tight font-semibold">
                {{ d.title || 'Untitled event' }}
              </h1>
              <span
                class="badge h-[22px] px-2"
                [class]="d.is_active ? 'bg-yes-soft text-yes' : 'bg-track text-[#4a4a46]'"
              >
                {{ d.is_active ? 'Active' : 'Inactive' }}
              </span>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[13px] text-muted" role="status">
              {{ saving() ? 'Saving…' : dirty() ? 'Unsaved changes' : 'All changes saved' }}
            </span>
            <a class="btn h-10" [routerLink]="['/admin/events', id(), 'rsvps']">RSVPs</a>
            <a class="btn h-10" [href]="savedUrl()" target="_blank" rel="noopener">View page ↗</a>
            <button
              type="button"
              class="btn btn-primary h-10"
              [disabled]="!dirty() || saving()"
              (click)="save()"
            >
              Save changes
            </button>
          </div>
        </div>
      </div>

      <!-- Phones: switch between the form and the preview -->
      <div
        class="sticky top-14 z-15 flex justify-center border-b border-line bg-ground px-4 py-2.5 wide:hidden"
      >
        <div class="segmented w-full max-w-[360px]">
          <button
            type="button"
            class="h-[38px]!"
            [attr.aria-pressed]="!mobilePreview()"
            (click)="mobilePreview.set(false)"
          >
            Edit
          </button>
          <button
            type="button"
            class="h-[38px]!"
            [attr.aria-pressed]="mobilePreview()"
            (click)="mobilePreview.set(true)"
          >
            Preview
          </button>
        </div>
      </div>

      <div
        class="wide:mx-auto wide:grid wide:max-w-[1280px] wide:grid-cols-[minmax(0,1fr)_380px] wide:items-start wide:gap-10 wide:px-4 wide:pb-16"
      >
        <main
          class="min-w-0 px-4 pt-5 pb-16 wide:px-0"
          [class]="mobilePreview() ? 'max-wide:hidden' : ''"
        >
          <div
            role="tablist"
            aria-label="Event settings"
            class="mb-6 flex gap-0.5 overflow-x-auto overflow-y-hidden border-b border-line"
            (keydown)="moveTab($event)"
          >
            @for (t of tabs; track t.value) {
              @let on = tab() === t.value;
              <button
                type="button"
                role="tab"
                [id]="'tab-' + t.value"
                [attr.aria-controls]="'panel-' + t.value"
                [attr.aria-selected]="on"
                [attr.tabindex]="on ? 0 : -1"
                class="-mb-px h-11 shrink-0 cursor-pointer border-b-2 px-3.5"
                [class]="on ? 'border-ink font-semibold text-ink' : 'border-transparent text-muted'"
                (click)="tab.set(t.value)"
              >
                {{ t.label }}
              </button>
            }
          </div>

          <div role="tabpanel" [id]="'panel-' + tab()" [attr.aria-labelledby]="'tab-' + tab()">
            @switch (tab()) {
              @case ('details') {
                <div class="flex max-w-[620px] flex-col gap-5">
                  <label class="field">
                    Title
                    <input
                      #title
                      class="input"
                      maxlength="120"
                      [value]="d.title"
                      [attr.aria-invalid]="!!errors().title"
                      (input)="update({ title: title.value })"
                    />
                    @if (errors().title) {
                      <span class="field-error">{{ errors().title }}</span>
                    }
                  </label>

                  <label class="field">
                    Link
                    <span
                      class="flex h-11 items-stretch overflow-hidden rounded-md border border-line-strong bg-white focus-within:outline-2 focus-within:outline-focus"
                      [class.border-danger]="!!errors().slug"
                    >
                      <span
                        class="flex items-center border-r border-line bg-ground px-2.5 font-mono text-[13px] font-normal text-muted"
                        >{{ basePath }}</span
                      >
                      <input
                        #slug
                        class="min-w-0 flex-1 px-2.5 font-mono text-[15px] font-normal outline-none"
                        maxlength="64"
                        autocapitalize="off"
                        spellcheck="false"
                        [value]="d.slug"
                        [attr.aria-invalid]="!!errors().slug"
                        (input)="slug.value = slugify(slug.value); update({ slug: slug.value })"
                      />
                    </span>
                    <span class="hint break-all">
                      Guests will open <span class="font-mono text-ink">{{ draftUrl() }}</span>
                    </span>
                    @if (d.slug) {
                      <span class="hint break-words">
                        Invitation code:
                        <strong class="font-mono font-medium text-ink">{{ d.slug }}</strong>
                        (guests can also type this at
                        <span class="font-mono text-ink break-all">{{ homeUrl }}</span
                        >)
                      </span>
                    }
                    @if (errors().slug) {
                      <span class="field-error">{{ errors().slug }}</span>
                    }
                  </label>

                  <div class="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
                    <label class="field">
                      Date
                      <input
                        #date
                        type="date"
                        class="input"
                        [value]="d.event_date"
                        [attr.aria-invalid]="!!errors().event_date"
                        (input)="update({ event_date: date.value })"
                      />
                    </label>
                    <label class="field">
                      Starts
                      <input
                        #start
                        type="time"
                        class="input"
                        [value]="d.start_time"
                        [attr.aria-invalid]="!!errors().start_time"
                        (input)="update({ start_time: start.value })"
                      />
                    </label>
                    <label class="field">
                      Ends
                      <input
                        #end
                        type="time"
                        class="input"
                        [value]="d.end_time"
                        (input)="update({ end_time: end.value })"
                      />
                    </label>
                  </div>
                  @if (errors().event_date || errors().start_time) {
                    <span class="field-error -mt-3">{{
                      errors().event_date || errors().start_time
                    }}</span>
                  } @else if (d.end_time && d.end_time <= d.start_time) {
                    <span class="hint -mt-3">Ends the next day.</span>
                  }

                  <label class="field">
                    Time zone
                    <select
                      #zone
                      class="input"
                      [value]="d.timezone"
                      (change)="update({ timezone: zone.value })"
                    >
                      @for (z of zones(); track z) {
                        <option [value]="z">{{ z }}</option>
                      }
                    </select>
                  </label>
                  <label class="field">
                    Location name
                    <input
                      #venue
                      class="input"
                      maxlength="200"
                      [value]="d.location_name"
                      (input)="update({ location_name: venue.value })"
                    />
                  </label>
                  <label class="field">
                    Address
                    <input
                      #address
                      class="input"
                      maxlength="300"
                      [value]="d.location_address"
                      (input)="update({ location_address: address.value })"
                    />
                    <span class="hint">Used for the "Open in Maps" link.</span>
                  </label>
                </div>
              }

              @case ('wording') {
                <div class="flex max-w-[620px] flex-col gap-5">
                  <label class="field">
                    Message
                    <textarea
                      #message
                      rows="3"
                      class="input"
                      maxlength="4000"
                      [value]="d.description"
                      (input)="update({ description: message.value })"
                    ></textarea>
                    <span class="hint">Optional. Shown under the location.</span>
                  </label>
                  @for (f of wordingFields; track f.key) {
                    <label class="field">
                      {{ f.label }}
                      <input
                        #text
                        class="input"
                        [attr.maxlength]="f.max"
                        [value]="d[f.key]"
                        [attr.aria-invalid]="!!errors()[f.key]"
                        (input)="setText(f.key, text.value)"
                      />
                      @if (f.hint) {
                        <span class="hint">{{ f.hint }}</span>
                      }
                      @if (errors()[f.key]) {
                        <span class="field-error">{{ errors()[f.key] }}</span>
                      }
                    </label>
                  }
                </div>
              }

              @case ('rsvp') {
                <div class="panel flex max-w-[620px] flex-col">
                  @for (s of switches(); track s.label) {
                    <div
                      class="flex items-center justify-between gap-6 border-b border-[#efeeea] py-3.5 pr-4 pl-5 last:border-b-0"
                    >
                      <div class="flex flex-col gap-0.5">
                        <span class="font-medium" [class.text-faint]="s.disabled">{{
                          s.label
                        }}</span>
                        <span class="hint">{{ s.hint }}</span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        class="switch"
                        [attr.aria-checked]="s.on"
                        [attr.aria-label]="s.label"
                        [disabled]="s.disabled"
                        (click)="s.toggle()"
                      ></button>
                    </div>
                  }
                </div>

                <div
                  class="panel mt-6 flex max-w-[620px] flex-wrap items-center justify-between gap-4 py-3.5 pr-4 pl-5"
                >
                  <div class="flex flex-col gap-0.5">
                    <span class="font-medium">Delete event</span>
                    <span class="hint"
                      >Removes the event, all its replies and its images. The link stops
                      working.</span
                    >
                  </div>
                  <button
                    type="button"
                    class="btn btn-danger h-10"
                    [disabled]="deleting()"
                    (click)="deleteEvent()"
                  >
                    {{ deleting() ? 'Deleting…' : 'Delete event' }}
                  </button>
                </div>
              }

              @case ('look') {
                <app-look-editor
                  [theme]="d.theme"
                  [eventId]="id()"
                  (themeChange)="update({ theme: $event })"
                  (uploaded)="uploads.add($event)"
                />
              }
            }
          </div>
        </main>

        <aside
          class="pt-4 wide:sticky wide:top-[72px] wide:pt-5"
          [class]="mobilePreview() ? '' : 'max-wide:hidden'"
          aria-label="Preview"
        >
          <app-event-preview
            [event]="previewEvent()!"
            [theme]="d.theme"
            [active]="d.is_active"
            [pageUrl]="draftUrl()"
          />
        </aside>
      </div>
    } @else {
      <div class="panel m-4 flex flex-col items-start gap-3 p-6">
        <p>This event doesn't exist anymore.</p>
        <a routerLink="/admin" class="btn">← Events</a>
      </div>
    }
  `,
})
export default class EventEditor {
  readonly id = input.required<string>();

  private readonly supabase = inject(SUPABASE);
  private readonly document = inject(DOCUMENT);
  private readonly ui = inject(AdminUi);
  private readonly router = inject(Router);

  protected readonly tabs = TABS;
  protected readonly slugify = slugify;
  protected readonly basePath = this.ui.basePath();
  protected readonly homeUrl = this.ui.eventUrl('');
  protected readonly wordingFields = [
    { key: 'rsvp_question', label: 'RSVP question', max: 200, hint: '' },
    { key: 'button_text', label: 'Button text', max: 40, hint: '' },
    {
      key: 'confirmation_message',
      label: 'Confirmation message',
      max: 500,
      hint: 'Shown after a guest replies. Switch the preview to "Sent" to check it.',
    },
    { key: 'notes_label', label: 'Notes label', max: 120, hint: '' },
  ] as const;

  /** Images uploaded while editing; unused ones are deleted on save or discard. */
  protected readonly uploads = new Set<string>();

  protected readonly event = resource({
    params: () => ({ id: this.id() }),
    loader: async ({ params }) => {
      const { data, error } = await this.supabase
        .from('events')
        .select('*')
        .eq('id', params.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  private readonly saved = linkedSignal<Draft | null>(() =>
    this.event.hasValue() && this.event.value() ? toDraft(this.event.value()!) : null,
  );
  protected readonly draft = linkedSignal<Draft | null>(() => this.saved());

  protected readonly tab = signal<Tab>('details');
  protected readonly mobilePreview = signal(false);
  protected readonly saving = signal(false);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly deleting = signal(false);
  private deleted = false;

  protected readonly dirty = computed(
    () => JSON.stringify(this.draft()) !== JSON.stringify(this.saved()),
  );
  protected readonly draftUrl = computed(() => this.ui.eventUrl(this.draft()?.slug ?? ''));
  protected readonly savedUrl = computed(() => this.ui.eventUrl(this.saved()?.slug ?? ''));
  protected readonly zones = computed(() => {
    const current = this.draft()?.timezone;
    return current && !TIME_ZONES.includes(current) ? [current, ...TIME_ZONES] : TIME_ZONES;
  });

  protected readonly previewEvent = computed<PublicEvent | null>(() => {
    const d = this.draft();
    if (!d) return null;
    const row = toRow(d);
    return { ...row, title: row.title || 'Untitled event', theme: d.theme, end_time: row.end_time };
  });

  protected readonly switches = computed(() => {
    const d = this.draft()!;
    return [
      {
        label: 'Accepting replies',
        hint: 'When off, the link shows “This RSVP page isn’t available”.',
        on: d.is_active,
        disabled: false,
        toggle: () => this.update({ is_active: !this.draft()!.is_active }),
      },
      {
        label: 'Notes field',
        hint: 'An extra text box under the reply choices.',
        on: d.notes_enabled,
        disabled: false,
        toggle: () => this.update({ notes_enabled: !this.draft()!.notes_enabled }),
      },
      {
        label: 'Notes required',
        hint: "Guests can't send without filling it in.",
        on: d.notes_enabled && d.notes_required,
        disabled: !d.notes_enabled,
        toggle: () => this.update({ notes_required: !this.draft()!.notes_required }),
      },
    ];
  });

  protected update(change: Partial<Draft>): void {
    this.draft.update((d) => d && { ...d, ...change });
    const cleared = Object.keys(change).filter((key) => key in this.errors());
    if (cleared.length) {
      this.errors.update((errors) => {
        const next = { ...errors };
        for (const key of cleared) delete next[key as Field];
        return next;
      });
    }
  }

  protected setText(field: (typeof this.wordingFields)[number]['key'], value: string): void {
    this.update({ [field]: value });
  }

  protected moveTab(event: KeyboardEvent): void {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    const index = TABS.findIndex((t) => t.value === this.tab());
    const next = TABS[(index + step + TABS.length) % TABS.length].value;
    this.tab.set(next);
    this.document.getElementById(`tab-${next}`)?.focus();
  }

  protected async save(): Promise<void> {
    const draft = this.draft();
    if (!draft || this.saving()) return;

    const errors = validate(draft);
    this.errors.set(errors);
    const first = Object.keys(errors)[0] as Field | undefined;
    if (first) {
      this.tab.set(tabOf(first));
      this.mobilePreview.set(false);
      this.ui.toast('Fix the highlighted fields first.');
      return;
    }

    this.saving.set(true);
    const { error } = await this.supabase.from('events').update(toRow(draft)).eq('id', this.id());
    this.saving.set(false);

    if (error) {
      if (error.code === '23505') {
        this.errors.set({ slug: 'Another event already uses this link.' });
        this.tab.set('details');
        this.ui.toast('Fix the highlighted fields first.');
      } else {
        this.ui.toast("Couldn't save. Check your connection and try again.");
      }
      return;
    }

    const previous = this.saved();
    this.saved.set(draft);
    this.removeUnusedImages(draft.theme, previous ? themePaths(previous.theme) : []);
    this.ui.toast('Saved');
  }

  /**
   * Deletes the event after confirmation. Replies go with it (on delete cascade);
   * its images are removed from Storage afterwards.
   */
  protected async deleteEvent(): Promise<void> {
    const title = this.saved()?.title || 'this event';
    const { count } = await this.supabase
      .from('rsvps')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', this.id());
    const replies = count === 1 ? '1 reply' : `${count ?? 0} replies`;
    const confirmed = await this.ui.confirm({
      title: `Delete ${title}?`,
      body: `This permanently deletes the event and its ${replies}. Its link will show “not available”. It can't be undone.`,
      confirm: 'Delete event',
      danger: true,
    });
    if (!confirmed) return;

    this.deleting.set(true);
    const { error } = await this.supabase.from('events').delete().eq('id', this.id());
    if (error) {
      this.deleting.set(false);
      this.ui.toast("Couldn't delete the event. Try again.");
      return;
    }

    const bucket = this.supabase.storage.from(IMAGE_BUCKET);
    const { data: files } = await bucket.list(this.id());
    if (files?.length) await bucket.remove(files.map((f) => `${this.id()}/${f.name}`));

    this.deleted = true;
    this.ui.toast('Event deleted');
    await this.router.navigateByUrl('/admin');
  }

  /** Route guard: asks before leaving with unsaved changes. */
  async canLeave(): Promise<boolean> {
    if (this.deleted || !this.dirty()) return true;
    const discard = await this.ui.confirm({
      title: 'Discard unsaved changes?',
      body: "Your edits to this event haven't been saved.",
      confirm: 'Discard',
      danger: true,
    });
    const saved = this.saved();
    if (discard && saved) this.removeUnusedImages(saved.theme, []);
    return discard;
  }

  protected warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.deleted && this.dirty()) event.preventDefault();
  }

  /** Deletes earlier and session uploads that the kept theme no longer uses. */
  private removeUnusedImages(kept: EventTheme, earlier: string[]): void {
    const inUse = new Set(themePaths(kept));
    const unused = [...earlier, ...this.uploads].filter((path) => !inUse.has(path));
    this.uploads.clear();
    if (unused.length) void this.supabase.storage.from(IMAGE_BUCKET).remove(unused);
  }
}
