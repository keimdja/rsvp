import { Component, computed, DOCUMENT, inject, input, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { I18n, isLanguage, LOCALES } from '../../i18n';
import { AdminApi } from '../../api/admin-api';
import { RESPONSES, type RsvpResponse } from '../../api/models';
import { toCsv } from '../csv';
import { AdminUi, copiedState } from '../ui';

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
  templateUrl: './rsvp-list.html',
})
export default class RsvpList {
  readonly id = input.required<string>();

  private readonly api = inject(AdminApi);
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
        this.api.getEvent(params.id),
        this.api.listReplies(params.id),
      ]);
      return { event, rsvps };
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

    try {
      await this.api.deleteReply(reply.id);
    } catch {
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
