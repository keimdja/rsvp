import { Component, computed, DOCUMENT, inject, input, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { I18n, isLanguage, LOCALES } from '../i18n';
import { RESPONSES, type RsvpResponse, SUPABASE } from '../supabase';
import { toCsv } from './csv';
import { AdminUi, copiedState } from './ui';

type Filter = 'all' | RsvpResponse;

/** Local "YYYY-MM-DD HH:MM", which Excel and Sheets read as a date. */
function csvDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Component({
  selector: 'app-rsvp-list',
  imports: [RouterLink, TranslatePipe],
  template: `
    <main class="mx-auto flex max-w-[1120px] flex-col gap-[18px] px-4 pt-6 pb-16">
      @if (data.isLoading() && !data.hasValue()) {
        <p class="text-muted" role="status">{{ 'admin.list.loading' | translate }}</p>
      } @else if (data.error()) {
        <div class="panel flex flex-col items-start gap-3 p-6">
          <p>{{ 'admin.list.loadError' | translate }}</p>
          <button type="button" class="btn" (click)="data.reload()">
            {{ 'common.tryAgain' | translate }}
          </button>
        </div>
      } @else if (event(); as ev) {
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="flex min-w-0 flex-col gap-1.5">
            <a routerLink="/admin" class="text-[13px] text-muted">{{
              'common.back' | translate
            }}</a>
            <h1 class="text-2xl leading-tight font-semibold">{{ ev.title }}</h1>
            <span class="font-mono text-[15px] font-medium">
              {{ 'admin.dashboard.summary' | translate: counts() }}
            </span>
          </div>
          <div class="flex gap-2">
            <a class="btn hidden wide:inline-flex" [routerLink]="['/admin/events', ev.id]">{{
              'admin.list.editEvent' | translate
            }}</a>
            <button type="button" class="btn hidden wide:inline-flex" (click)="copyLink(ev.slug)">
              {{ (copied.copied() ? 'admin.copied' : 'admin.copyLink') | translate }}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="!all().length"
              (click)="exportCsv(ev.slug)"
            >
              {{ 'admin.list.exportCsv' | translate }}
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2.5">
          <div
            role="group"
            [attr.aria-label]="'admin.list.filterLabel' | translate"
            class="flex max-w-full min-w-0 gap-1.5 overflow-x-auto"
          >
            @for (chip of chips(); track chip.value) {
              <button
                type="button"
                class="h-10 shrink-0 cursor-pointer rounded-full border px-3.5 font-medium whitespace-nowrap"
                [class]="
                  filter() === chip.value
                    ? 'border-ink bg-ink text-white'
                    : 'border-[#d6d5d0] bg-white text-ink'
                "
                [attr.aria-pressed]="filter() === chip.value"
                (click)="filter.set(chip.value)"
              >
                {{ chip.label | translate }}
                <span class="font-mono opacity-75">{{ chip.count }}</span>
              </button>
            }
          </div>
          <input
            #searchBox
            type="search"
            class="input max-w-[320px] flex-[1_1_220px] text-base!"
            [placeholder]="'admin.list.searchPlaceholder' | translate"
            [attr.aria-label]="'admin.list.searchLabel' | translate"
            [value]="search()"
            (input)="search.set(searchBox.value)"
          />
        </div>

        <!-- Wide screens: table -->
        <div class="panel hidden overflow-hidden wide:block">
          <div
            class="grid grid-cols-[minmax(0,1.3fr)_100px_minmax(0,2fr)_150px_72px] gap-4 border-b border-line px-5 py-2.5 text-xs font-medium text-muted"
          >
            <span>{{ 'admin.list.columns.name' | translate }}</span>
            <span>{{ 'admin.list.columns.response' | translate }}</span>
            <span>{{ 'admin.list.columns.notes' | translate }}</span>
            <span>{{ 'admin.list.columns.submitted' | translate }}</span>
            <span></span>
          </div>
          @for (r of rows(); track r.id) {
            <div
              class="grid grid-cols-[minmax(0,1.3fr)_100px_minmax(0,2fr)_150px_72px] items-center gap-4 border-b border-[#efeeea] px-5 py-3 last:border-b-0 hover:bg-[#fafaf8]"
            >
              <span class="font-medium break-words">{{ r.guest_name }}</span>
              <span
                ><span class="badge" [class]="'badge-' + r.response">{{
                  'response.' + r.response | translate
                }}</span></span
              >
              <span class="text-pretty break-words" [class.text-faint]="!r.notes">{{
                r.notes || '—'
              }}</span>
              <span class="font-mono text-[13px] text-muted">{{ r.when }}</span>
              <button
                type="button"
                class="btn btn-sm border-transparent bg-transparent text-danger hover:border-[#e8c9c5] hover:bg-[#fbf3f2]"
                [attr.aria-label]="'admin.list.deleteLabel' | translate: { name: r.guest_name }"
                (click)="remove(r)"
              >
                {{ 'admin.list.delete' | translate }}
              </button>
            </div>
          }
          @if (emptyMessage()) {
            <p class="p-10 text-center text-muted">
              {{ emptyMessage() | translate: { query: search().trim() } }}
            </p>
          }
        </div>

        <!-- Phones: one card per guest -->
        <div class="flex flex-col gap-2 wide:hidden">
          @for (r of rows(); track r.id) {
            <div class="panel flex flex-col gap-1.5 px-3.5 pt-3 pb-1">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[15px] font-semibold break-words">{{ r.guest_name }}</span>
                <span class="badge" [class]="'badge-' + r.response">{{
                  'response.' + r.response | translate
                }}</span>
              </div>
              <span class="text-pretty break-words" [class.text-faint]="!r.notes">{{
                r.notes || '—'
              }}</span>
              <div class="flex items-center justify-between">
                <span class="font-mono text-xs text-muted">{{ r.when }}</span>
                <button
                  type="button"
                  class="h-11 cursor-pointer pr-1 pl-3 text-danger"
                  [attr.aria-label]="'admin.list.deleteLabel' | translate: { name: r.guest_name }"
                  (click)="remove(r)"
                >
                  {{ 'admin.list.delete' | translate }}
                </button>
              </div>
            </div>
          }
          @if (emptyMessage()) {
            <p class="panel p-8 text-center text-muted">
              {{ emptyMessage() | translate: { query: search().trim() } }}
            </p>
          }
        </div>
      } @else {
        <div class="panel flex flex-col items-start gap-3 p-6">
          <p>{{ 'admin.list.missing' | translate }}</p>
          <a routerLink="/admin" class="btn">{{ 'common.back' | translate }}</a>
        </div>
      }
    </main>
  `,
})
export default class RsvpList {
  readonly id = input.required<string>();

  private readonly supabase = inject(SUPABASE);
  private readonly document = inject(DOCUMENT);
  private readonly ui = inject(AdminUi);
  private readonly i18n = inject(I18n);
  private readonly translate = inject(TranslateService);

  protected readonly copied = copiedState();
  protected readonly filter = signal<Filter>('all');
  protected readonly search = signal('');

  protected readonly data = resource({
    params: () => ({ id: this.id() }),
    loader: async ({ params }) => {
      const [event, rsvps] = await Promise.all([
        this.supabase.from('events').select('id, slug, title').eq('id', params.id).maybeSingle(),
        this.supabase
          .from('rsvps')
          .select('id, guest_name, response, notes, created_at')
          .eq('event_id', params.id)
          .order('created_at', { ascending: false }),
      ]);
      if (event.error) throw event.error;
      if (rsvps.error) throw rsvps.error;
      return { event: event.data, rsvps: rsvps.data };
    },
  });

  protected readonly event = computed(() =>
    this.data.hasValue() ? this.data.value().event : null,
  );
  protected readonly all = computed(() => (this.data.hasValue() ? this.data.value().rsvps : []));

  protected readonly counts = computed(() => {
    const counts: Record<RsvpResponse, number> = { yes: 0, maybe: 0, no: 0 };
    for (const r of this.all()) counts[r.response]++;
    return counts;
  });

  protected readonly chips = computed(() => [
    { value: 'all' as Filter, label: 'admin.list.all', count: this.all().length },
    ...RESPONSES.map((value) => ({
      value: value as Filter,
      label: `response.${value}`,
      count: this.counts()[value],
    })),
  ]);

  protected readonly rows = computed(() => {
    const filter = this.filter();
    const query = this.search().trim().toLocaleLowerCase();
    const lang = this.i18n.current();
    const submitted = new Intl.DateTimeFormat(LOCALES[isLanguage(lang) ? lang : 'en'], {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    return this.all()
      .filter((r) => filter === 'all' || r.response === filter)
      .filter((r) => !query || r.guest_name.toLocaleLowerCase().includes(query))
      .map((r) => ({ ...r, when: submitted.format(new Date(r.created_at)) }));
  });

  protected readonly emptyMessage = computed(() => {
    if (!this.all().length) return 'admin.list.emptyNone';
    if (this.rows().length) return '';
    return this.search().trim() ? 'admin.list.emptySearch' : 'admin.list.emptyGroup';
  });

  protected async copyLink(slug: string): Promise<void> {
    if (await this.ui.copy(this.ui.eventUrl(slug))) this.copied.mark(slug);
  }

  protected async remove(reply: { id: string; guest_name: string }): Promise<void> {
    const confirmed = await this.ui.confirm({
      title: 'admin.list.confirmTitle',
      body: 'admin.list.confirmBody',
      confirm: 'admin.list.confirm',
      params: { name: reply.guest_name },
      danger: true,
    });
    if (!confirmed) return;

    const { error } = await this.supabase.from('rsvps').delete().eq('id', reply.id);
    if (error) {
      this.ui.toast('admin.list.deleteFailed');
      return;
    }
    this.data.update((d) => d && { ...d, rsvps: d.rsvps.filter((r) => r.id !== reply.id) });
    this.ui.toast('admin.list.deleted');
  }

  /** Exports every reply, regardless of the current filter or search. */
  protected exportCsv(slug: string): void {
    const csv = toCsv([
      ['name', 'response', 'notes', 'submitted'].map(
        (column) => this.translate.instant(`admin.list.columns.${column}`) as string,
      ),
      ...this.all().map((r) => [
        r.guest_name,
        this.translate.instant(`response.${r.response}`) as string,
        r.notes ?? '',
        csvDate(r.created_at),
      ]),
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = this.document.createElement('a');
    link.href = url;
    link.download = `${slug}-rsvps.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
