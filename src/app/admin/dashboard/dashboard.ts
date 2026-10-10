import { Component, computed, inject, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DEFAULT_WORDING, I18n, isLanguage, LOCALES } from '../../i18n';
import { AdminApi } from '../../api/admin-api';
import { AdminUi, copiedState } from '../ui';

interface EventItem {
  id: string;
  slug: string;
  title: string;
  date: string;
  past: boolean;
  active: boolean;
  yes: number;
  maybe: number;
  no: number;
  total: number;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './dashboard.html',
})
export default class Dashboard {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  private readonly ui = inject(AdminUi);
  private readonly i18n = inject(I18n);
  private readonly translate = inject(TranslateService);

  protected readonly copied = copiedState();
  protected readonly creating = signal(false);

  protected readonly events = resource({ loader: () => this.api.listEvents() });

  protected readonly items = computed<EventItem[]>(() => {
    const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
    const lang = this.i18n.current();
    const shortDate = new Intl.DateTimeFormat(LOCALES[isLanguage(lang) ? lang : 'en'], {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return (this.events.hasValue() ? this.events.value() : []).map((e) => ({
      id: e.id ?? '',
      slug: e.slug ?? '',
      title: e.title || (this.translate.instant('common.untitled') as string),
      date: e.event_date ? shortDate.format(new Date(`${e.event_date}T00:00:00Z`)) : '',
      past: !!e.event_date && e.event_date < today,
      active: !!e.is_active,
      yes: e.yes_count ?? 0,
      maybe: e.maybe_count ?? 0,
      no: e.no_count ?? 0,
      total: e.total_count ?? 0,
    }));
  });

  protected async toggle(item: EventItem): Promise<void> {
    const active = !item.active;
    const setActive = (value: boolean) =>
      this.events.update((list) =>
        list?.map((e) => (e.id === item.id ? { ...e, is_active: value } : e)),
      );
    setActive(active);
    try {
      await this.api.updateEvent(item.id, { is_active: active });
    } catch {
      setActive(!active);
      this.ui.toast('admin.dashboard.updateFailed');
      return;
    }
    this.ui.toast(active ? 'admin.dashboard.opened' : 'admin.dashboard.closed');
  }

  protected async copy(item: EventItem): Promise<void> {
    if (await this.ui.copy(this.ui.eventUrl(item.slug))) this.copied.mark(item.id);
  }

  /**
   * Creates an inactive event in the admin's current language (with that language's
   * default wording), then opens it in the editor.
   */
  protected async newEvent(): Promise<void> {
    const current = this.i18n.current();
    const language = isLanguage(current) ? current : 'en';

    this.creating.set(true);
    let id: string;
    try {
      id = await this.api.createEvent({
        title: this.translate.instant('admin.dashboard.newEventTitle') as string,
        language,
        ...DEFAULT_WORDING[language],
      });
    } catch {
      this.ui.toast('admin.dashboard.createFailed');
      return;
    } finally {
      this.creating.set(false);
    }
    this.ui.toast('admin.dashboard.created');
    await this.router.navigate(['/admin/events', id]);
  }
}
