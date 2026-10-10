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
import { toMapLink } from '../../guest/calendar';
import { DEFAULT_WORDING, isLanguage, type Language, LANGUAGES } from '../../i18n';
import { AdminApi } from '../../api/admin-api';
import { type AdminEvent, ApiError, type PublicEvent } from '../../api/models';
import { type EventTheme, resolveTheme } from '../../theme';
import { EventPreview } from '../event-preview/event-preview';
import { LookEditor } from '../look-editor/look-editor';
import { AdminUi } from '../ui';

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

function toDraft(row: AdminEvent): Draft {
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
  templateUrl: './event-editor.html',
})
export default class EventEditor {
  readonly id = input.required<string>();

  private readonly api = inject(AdminApi);
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
    loader: ({ params }) => this.api.getEvent(params.id),
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
    try {
      await this.api.updateEvent(this.id(), toRow(draft));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'slug_taken') {
        this.errors.set({ slug: 'admin.editor.errors.slugTaken' });
        this.tab.set('details');
        this.ui.toast('admin.editor.fixFields');
      } else {
        this.ui.toast('admin.editor.saveFailed');
      }
      return;
    } finally {
      this.saving.set(false);
    }

    const previous = this.saved();
    this.saved.set(draft);
    this.removeUnusedImages(draft.theme, previous ? themePaths(previous.theme) : []);
    this.ui.toast('admin.editor.saved');
  }

  /** Deletes the event, its replies and its images, after confirmation. */
  protected async deleteEvent(): Promise<void> {
    const title = this.saved()?.title || (this.translate.instant('common.untitled') as string);
    const count = (await this.api.listReplies(this.id()).catch(() => [])).length;
    const replies = this.translate.instant(
      count === 1 ? 'admin.editor.replyOne' : 'admin.editor.replyOther',
      { count },
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
    try {
      await this.api.deleteEvent(this.id());
    } catch {
      this.deleting.set(false);
      this.ui.toast('admin.editor.deleteFailed');
      return;
    }

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
    void this.api.removeImages(unused);
  }
}
