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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toMapLink } from '../guest/calendar';
import { DEFAULT_WORDING, isLanguage, type Language, LANGUAGES } from '../i18n';
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
  location_url: string;
  rsvp_question: string;
  button_text: string;
  confirmation_message: string;
  notes_label: string;
  notes_enabled: boolean;
  notes_required: boolean;
  is_active: boolean;
  language: Language;
  theme: EventTheme;
}
type Field = keyof Draft;
type Tab = 'details' | 'wording' | 'rsvp' | 'look';

const TABS: Tab[] = ['details', 'wording', 'rsvp', 'look'];

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
    location_url: row.location_url ?? '',
    rsvp_question: row.rsvp_question,
    button_text: row.button_text,
    confirmation_message: row.confirmation_message,
    notes_label: row.notes_label,
    notes_enabled: row.notes_enabled,
    notes_required: row.notes_required,
    is_active: row.is_active,
    language: isLanguage(row.language) ? row.language : 'en',
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
    location_url: toMapLink(d.location_url),
    rsvp_question: d.rsvp_question.trim(),
    button_text: d.button_text.trim(),
    confirmation_message: d.confirmation_message.trim(),
    notes_label: d.notes_label.trim(),
    notes_enabled: d.notes_enabled,
    notes_required: d.notes_enabled && d.notes_required,
    is_active: d.is_active,
    language: d.language,
    theme: { ...d.theme },
  };
}

/** Returns translation keys of the errors, per field. */
function validate(d: Draft): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (!d.title.trim()) errors.title = 'admin.editor.errors.title';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.slug)) {
    errors.slug = 'admin.editor.errors.slugFormat';
  } else if (d.slug.length < 3 || d.slug.length > 64) {
    errors.slug = 'admin.editor.errors.slugLength';
  } else if (RESERVED_SLUGS.includes(d.slug)) {
    errors.slug = 'admin.editor.errors.slugReserved';
  }
  if (!d.event_date) errors.event_date = 'admin.editor.errors.date';
  if (!d.start_time) errors.start_time = 'admin.editor.errors.start';
  if (d.location_url.trim() && !toMapLink(d.location_url)) {
    errors.location_url = 'admin.editor.errors.mapLink';
  }
  for (const field of [
    'rsvp_question',
    'button_text',
    'confirmation_message',
    'notes_label',
  ] as const) {
    if (!d[field].trim()) errors[field] = 'admin.editor.errors.empty';
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
  imports: [RouterLink, EventPreview, LookEditor, TranslatePipe],
  host: { '(window:beforeunload)': 'warnBeforeUnload($event)' },
  template: `
    @if (event.isLoading() && !event.hasValue()) {
      <p class="p-4 text-muted" role="status">{{ 'admin.editor.loading' | translate }}</p>
    } @else if (event.error()) {
      <div class="panel m-4 flex flex-col items-start gap-3 p-6">
        <p>{{ 'admin.editor.loadError' | translate }}</p>
        <button type="button" class="btn" (click)="event.reload()">
          {{ 'common.tryAgain' | translate }}
        </button>
      </div>
    } @else if (draft(); as d) {
      <div class="border-b border-line bg-white">
        <div
          class="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-4 gap-y-3 p-4"
        >
          <div class="flex min-w-0 flex-col gap-1">
            <a routerLink="/admin" class="text-[13px] text-muted">{{
              'common.back' | translate
            }}</a>
            <div class="flex min-w-0 items-center gap-2.5">
              <h1 class="truncate text-[22px] leading-tight font-semibold">
                {{ d.title || ('common.untitled' | translate) }}
              </h1>
              <!-- Same setting as "Accepting replies" in the RSVP tab, reachable from every tab. -->
              <span class="flex shrink-0 items-center">
                <button
                  type="button"
                  role="switch"
                  class="switch -my-2.5"
                  [attr.aria-checked]="d.is_active"
                  [attr.aria-label]="'admin.editor.switches.accepting' | translate"
                  (click)="update({ is_active: !d.is_active })"
                ></button>
                <span
                  class="text-[13px] font-semibold"
                  [class]="d.is_active ? 'text-yes' : 'text-muted'"
                >
                  {{ (d.is_active ? 'admin.editor.active' : 'admin.editor.inactive') | translate }}
                </span>
              </span>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[13px] text-muted" role="status">
              {{
                (saving()
                  ? 'admin.editor.saving'
                  : dirty()
                    ? 'admin.editor.unsaved'
                    : 'admin.editor.allSaved'
                ) | translate
              }}
            </span>
            <a class="btn h-10" [routerLink]="['/admin/events', id(), 'rsvps']">{{
              'admin.editor.rsvps' | translate
            }}</a>
            <a class="btn h-10" [href]="savedUrl()" target="_blank" rel="noopener">{{
              'admin.editor.viewPage' | translate
            }}</a>
            <button
              type="button"
              class="btn btn-primary h-10"
              [disabled]="!dirty() || saving()"
              (click)="save()"
            >
              {{ 'admin.editor.save' | translate }}
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
            {{ 'admin.editor.edit' | translate }}
          </button>
          <button
            type="button"
            class="h-[38px]!"
            [attr.aria-pressed]="mobilePreview()"
            (click)="mobilePreview.set(true)"
          >
            {{ 'admin.editor.preview' | translate }}
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
            [attr.aria-label]="'admin.editor.tabsLabel' | translate"
            class="mb-6 flex gap-0.5 overflow-x-auto overflow-y-hidden border-b border-line"
            (keydown)="moveTab($event)"
          >
            @for (t of tabs; track t) {
              @let on = tab() === t;
              <button
                type="button"
                role="tab"
                [id]="'tab-' + t"
                [attr.aria-controls]="'panel-' + t"
                [attr.aria-selected]="on"
                [attr.tabindex]="on ? 0 : -1"
                class="-mb-px h-11 shrink-0 cursor-pointer border-b-2 px-3.5"
                [class]="on ? 'border-ink font-semibold text-ink' : 'border-transparent text-muted'"
                (click)="tab.set(t)"
              >
                {{ 'admin.editor.tabs.' + t | translate }}
              </button>
            }
          </div>

          <div role="tabpanel" [id]="'panel-' + tab()" [attr.aria-labelledby]="'tab-' + tab()">
            @switch (tab()) {
              @case ('details') {
                <div class="flex max-w-[620px] flex-col gap-5">
                  <label class="field">
                    {{ 'admin.editor.title' | translate }}
                    <input
                      #title
                      class="input"
                      maxlength="120"
                      [value]="d.title"
                      [attr.aria-invalid]="!!errors().title"
                      (input)="update({ title: title.value })"
                    />
                    @if (errors().title) {
                      <span class="field-error">{{ errors().title | translate }}</span>
                    }
                  </label>

                  <label class="field">
                    {{ 'admin.editor.link' | translate }}
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
                      {{ 'admin.editor.guestsWillOpen' | translate }}
                      <span class="font-mono text-ink">{{ draftUrl() }}</span>
                    </span>
                    @if (d.slug) {
                      <span class="hint break-words">
                        {{ 'admin.editor.code' | translate }}
                        <strong class="font-mono font-medium text-ink">{{ d.slug }}</strong>
                        · {{ 'admin.editor.codeHint' | translate: { url: homeUrl } }}
                      </span>
                    }
                    @if (errors().slug) {
                      <span class="field-error">{{ errors().slug | translate }}</span>
                    }
                  </label>

                  <div class="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
                    <label class="field">
                      {{ 'admin.editor.date' | translate }}
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
                      {{ 'admin.editor.starts' | translate }}
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
                      {{ 'admin.editor.ends' | translate }}
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
                      errors().event_date || errors().start_time | translate
                    }}</span>
                  } @else if (d.end_time && d.end_time <= d.start_time) {
                    <span class="hint -mt-3">{{ 'admin.editor.endsNextDay' | translate }}</span>
                  }

                  <label class="field">
                    {{ 'admin.editor.timezone' | translate }}
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
                    {{ 'admin.editor.locationName' | translate }}
                    <input
                      #venue
                      class="input"
                      maxlength="200"
                      [value]="d.location_name"
                      (input)="update({ location_name: venue.value })"
                    />
                  </label>
                  <label class="field">
                    {{ 'admin.editor.address' | translate }}
                    <input
                      #address
                      class="input"
                      maxlength="300"
                      [value]="d.location_address"
                      (input)="update({ location_address: address.value })"
                    />
                    <span class="hint">{{ 'admin.editor.addressHint' | translate }}</span>
                  </label>

                  <label class="field">
                    {{ 'admin.editor.mapLink' | translate }}
                    <input
                      #mapLink
                      type="url"
                      inputmode="url"
                      class="input"
                      maxlength="2000"
                      autocapitalize="off"
                      spellcheck="false"
                      placeholder="https://maps.app.goo.gl/…"
                      [value]="d.location_url"
                      [attr.aria-invalid]="!!errors().location_url"
                      (input)="update({ location_url: mapLink.value })"
                      (blur)="tidyMapLink(mapLink)"
                    />
                    <span class="hint">{{ 'admin.editor.mapLinkHint' | translate }}</span>
                    @if (errors().location_url) {
                      <span class="field-error">{{ errors().location_url | translate }}</span>
                    }
                  </label>
                </div>
              }

              @case ('wording') {
                <div class="flex max-w-[620px] flex-col gap-5">
                  <label class="field">
                    {{ 'admin.editor.language' | translate }}
                    <select
                      #language
                      class="input"
                      [value]="d.language"
                      (change)="setLanguage($any(language.value))"
                    >
                      @for (lang of languages; track lang) {
                        <option [value]="lang" [attr.lang]="lang">
                          {{ 'common.languages.' + lang | translate }}
                        </option>
                      }
                    </select>
                    <span class="hint">{{ 'admin.editor.languageHint' | translate }}</span>
                  </label>
                  <label class="field">
                    {{ 'admin.editor.message' | translate }}
                    <textarea
                      #message
                      rows="3"
                      class="input"
                      maxlength="4000"
                      [value]="d.description"
                      (input)="update({ description: message.value })"
                    ></textarea>
                    <span class="hint">{{ 'admin.editor.messageHint' | translate }}</span>
                  </label>
                  @for (f of wordingFields; track f.key) {
                    <label class="field">
                      {{ f.label | translate }}
                      <input
                        #text
                        class="input"
                        [attr.maxlength]="f.max"
                        [value]="d[f.key]"
                        [attr.aria-invalid]="!!errors()[f.key]"
                        (input)="setText(f.key, text.value)"
                      />
                      @if (f.hint) {
                        <span class="hint">{{ f.hint | translate }}</span>
                      }
                      @if (errors()[f.key]) {
                        <span class="field-error">{{ errors()[f.key] | translate }}</span>
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
                          s.label | translate
                        }}</span>
                        <span class="hint">{{ s.hint | translate }}</span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        class="switch"
                        [attr.aria-checked]="s.on"
                        [attr.aria-label]="s.label | translate"
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
                    <span class="font-medium">{{ 'admin.editor.deleteTitle' | translate }}</span>
                    <span class="hint">{{ 'admin.editor.deleteHint' | translate }}</span>
                  </div>
                  <button
                    type="button"
                    class="btn btn-danger h-10"
                    [disabled]="deleting()"
                    (click)="deleteEvent()"
                  >
                    {{ (deleting() ? 'admin.editor.deleting' : 'admin.editor.delete') | translate }}
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
          [attr.aria-label]="'admin.editor.preview' | translate"
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
        <p>{{ 'admin.editor.missing' | translate }}</p>
        <a routerLink="/admin" class="btn">{{ 'common.back' | translate }}</a>
      </div>
    }
  `,
})
export default class EventEditor {
  readonly id = input.required<string>();

  private readonly supabase = inject(SUPABASE);
  private readonly document = inject(DOCUMENT);
  private readonly ui = inject(AdminUi);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  protected readonly tabs = TABS;
  protected readonly languages = LANGUAGES;
  protected readonly slugify = slugify;
  protected readonly basePath = this.ui.basePath();
  protected readonly homeUrl = this.ui.eventUrl('');
  protected readonly wordingFields = [
    { key: 'rsvp_question', label: 'admin.editor.rsvpQuestion', max: 200, hint: '' },
    { key: 'button_text', label: 'admin.editor.buttonText', max: 40, hint: '' },
    {
      key: 'confirmation_message',
      label: 'admin.editor.confirmationMessage',
      max: 500,
      hint: 'admin.editor.confirmationHint',
    },
    { key: 'notes_label', label: 'admin.editor.notesLabel', max: 120, hint: '' },
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
    return {
      ...row,
      title: row.title || (this.translate.instant('common.untitled') as string),
      theme: d.theme,
      end_time: row.end_time,
    };
  });

  protected readonly switches = computed(() => {
    const d = this.draft()!;
    return [
      {
        label: 'admin.editor.switches.accepting',
        hint: 'admin.editor.switches.acceptingHint',
        on: d.is_active,
        disabled: false,
        toggle: () => this.update({ is_active: !this.draft()!.is_active }),
      },
      {
        label: 'admin.editor.switches.notes',
        hint: 'admin.editor.switches.notesHint',
        on: d.notes_enabled,
        disabled: false,
        toggle: () => this.update({ notes_enabled: !this.draft()!.notes_enabled }),
      },
      {
        label: 'admin.editor.switches.notesRequired',
        hint: 'admin.editor.switches.notesRequiredHint',
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

  /** Switches the guest page language and swaps any wording still at the old default. */
  protected setLanguage(language: Language): void {
    const draft = this.draft();
    if (!draft || draft.language === language) return;
    const from = DEFAULT_WORDING[draft.language];
    const to = DEFAULT_WORDING[language];
    const wording = (Object.keys(to) as (keyof typeof to)[]).filter(
      (field) => draft[field] === from[field],
    );
    this.update({ language, ...Object.fromEntries(wording.map((field) => [field, to[field]])) });
  }

  /** Shows the cleaned-up link (e.g. with https:// added) once the field loses focus. */
  protected tidyMapLink(input: HTMLInputElement): void {
    const link = toMapLink(input.value);
    if (link && link !== input.value) {
      input.value = link;
      this.update({ location_url: link });
    }
  }

  protected moveTab(event: KeyboardEvent): void {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    const index = TABS.indexOf(this.tab());
    const next = TABS[(index + step + TABS.length) % TABS.length];
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
      this.ui.toast('admin.editor.fixFields');
      return;
    }

    this.saving.set(true);
    const { error } = await this.supabase.from('events').update(toRow(draft)).eq('id', this.id());
    this.saving.set(false);

    if (error) {
      if (error.code === '23505') {
        this.errors.set({ slug: 'admin.editor.errors.slugTaken' });
        this.tab.set('details');
        this.ui.toast('admin.editor.fixFields');
      } else {
        this.ui.toast('admin.editor.saveFailed');
      }
      return;
    }

    const previous = this.saved();
    this.saved.set(draft);
    this.removeUnusedImages(draft.theme, previous ? themePaths(previous.theme) : []);
    this.ui.toast('admin.editor.saved');
  }

  /**
   * Deletes the event after confirmation. Replies go with it (on delete cascade);
   * its images are removed from Storage afterwards.
   */
  protected async deleteEvent(): Promise<void> {
    const title = this.saved()?.title || (this.translate.instant('common.untitled') as string);
    const { count } = await this.supabase
      .from('rsvps')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', this.id());
    const replies = this.translate.instant(
      count === 1 ? 'admin.editor.replyOne' : 'admin.editor.replyOther',
      { count: count ?? 0 },
    ) as string;
    const confirmed = await this.ui.confirm({
      title: 'admin.editor.deleteConfirmTitle',
      body: 'admin.editor.deleteConfirmBody',
      confirm: 'admin.editor.delete',
      params: { title, replies },
      danger: true,
    });
    if (!confirmed) return;

    this.deleting.set(true);
    const { error } = await this.supabase.from('events').delete().eq('id', this.id());
    if (error) {
      this.deleting.set(false);
      this.ui.toast('admin.editor.deleteFailed');
      return;
    }

    const bucket = this.supabase.storage.from(IMAGE_BUCKET);
    const { data: files } = await bucket.list(this.id());
    if (files?.length) await bucket.remove(files.map((f) => `${this.id()}/${f.name}`));

    this.deleted = true;
    this.ui.toast('admin.editor.deleted');
    await this.router.navigateByUrl('/admin');
  }

  /** Route guard: asks before leaving with unsaved changes. */
  async canLeave(): Promise<boolean> {
    if (this.deleted || !this.dirty()) return true;
    const discard = await this.ui.confirm({
      title: 'admin.editor.discardTitle',
      body: 'admin.editor.discardBody',
      confirm: 'admin.editor.discard',
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
