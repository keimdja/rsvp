import { Component, computed, inject, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SUPABASE } from '../supabase';
import { AdminUi, copiedState } from './ui';

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

const shortDate = new Intl.DateTimeFormat(undefined, {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  template: `
    <main class="mx-auto flex max-w-[1120px] flex-col gap-5 px-4 pt-7 pb-16">
      <div class="flex items-center justify-between gap-3">
        <h1 class="text-2xl leading-tight font-semibold">Events</h1>
        <button type="button" class="btn btn-primary" [disabled]="creating()" (click)="newEvent()">
          + New event
        </button>
      </div>

      @if (events.isLoading() && !events.hasValue()) {
        <p class="text-muted" role="status">Loading events…</p>
      } @else if (events.error()) {
        <div class="panel flex flex-col items-start gap-3 p-6">
          <p>Couldn't load events. Check your connection.</p>
          <button type="button" class="btn" (click)="events.reload()">Try again</button>
        </div>
      } @else if (items().length === 0) {
        <div
          class="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-line-strong bg-white px-6 py-18 text-center"
        >
          <h2 class="text-[17px] font-semibold">No events yet</h2>
          <p class="max-w-[360px] text-muted">
            Create an event to get a link you can share with guests.
          </p>
          <button
            type="button"
            class="btn btn-primary mt-2"
            [disabled]="creating()"
            (click)="newEvent()"
          >
            + New event
          </button>
        </div>
      } @else {
        <!-- Wide screens: table -->
        <div class="panel hidden overflow-hidden wide:block">
          <div
            class="grid grid-cols-[minmax(0,2.4fr)_140px_52px_56px_48px_56px_60px_270px] items-center gap-3 border-b border-line px-5 py-2.5 text-xs font-medium text-muted"
          >
            <span>Event</span><span>Date</span><span class="text-right">Yes</span>
            <span class="text-right">Maybe</span><span class="text-right">No</span>
            <span class="text-right">Total</span><span>Active</span><span></span>
          </div>
          @for (e of items(); track e.id) {
            <div
              class="grid grid-cols-[minmax(0,2.4fr)_140px_52px_56px_48px_56px_60px_270px] items-center gap-3 border-b border-[#efeeea] px-5 py-3 last:border-b-0 hover:bg-[#fafaf8]"
            >
              <a [routerLink]="['events', e.id]" class="flex min-w-0 flex-col gap-0.5">
                <span class="truncate text-[15px] font-semibold" [class.text-muted]="!e.active">
                  {{ e.title }}
                </span>
                <span class="truncate font-mono text-xs text-muted">/{{ e.slug }}</span>
              </a>
              <span [class.text-faint]="e.past">{{ e.date }}</span>
              <span class="text-right font-mono font-medium">{{ e.yes }}</span>
              <span class="text-right font-mono font-medium">{{ e.maybe }}</span>
              <span class="text-right font-mono font-medium">{{ e.no }}</span>
              <span class="text-right font-mono font-semibold">{{ e.total }}</span>
              <button
                type="button"
                role="switch"
                class="switch"
                [attr.aria-checked]="e.active"
                [attr.aria-label]="'Accepting replies for ' + e.title"
                (click)="toggle(e)"
              ></button>
              <div class="flex justify-end gap-1.5">
                <button type="button" class="btn btn-sm min-w-[88px]" (click)="copy(e)">
                  {{ copied.copied() === e.id ? 'Copied ✓' : 'Copy link' }}
                </button>
                <a class="btn btn-sm" [routerLink]="['events', e.id, 'rsvps']">View RSVPs</a>
                <a class="btn btn-sm" [routerLink]="['events', e.id]">Edit</a>
              </div>
            </div>
          }
        </div>

        <!-- Phones: one card per event -->
        <div class="flex flex-col gap-2.5 wide:hidden">
          @for (e of items(); track e.id) {
            <div class="panel flex flex-col gap-2.5 px-4 pt-3.5 pb-2.5">
              <div class="flex items-start justify-between gap-2">
                <a [routerLink]="['events', e.id]" class="flex min-w-0 flex-col gap-0.5">
                  <span class="truncate text-[15px] font-semibold" [class.text-muted]="!e.active">
                    {{ e.title }}
                  </span>
                  <span class="truncate font-mono text-xs text-muted"
                    >/{{ e.slug }} · {{ e.date }}</span
                  >
                </a>
                <button
                  type="button"
                  role="switch"
                  class="switch -mt-2 -mr-2"
                  [attr.aria-checked]="e.active"
                  [attr.aria-label]="'Accepting replies for ' + e.title"
                  (click)="toggle(e)"
                ></button>
              </div>
              <span class="font-mono text-[13px] font-medium">
                {{ e.yes }} Yes · {{ e.maybe }} Maybe · {{ e.no }} No
              </span>
              <div class="grid grid-cols-3 gap-1.5">
                <button type="button" class="btn btn-sm h-11" (click)="copy(e)">
                  {{ copied.copied() === e.id ? 'Copied ✓' : 'Copy link' }}
                </button>
                <a class="btn btn-sm h-11" [routerLink]="['events', e.id, 'rsvps']">RSVPs</a>
                <a class="btn btn-sm h-11" [routerLink]="['events', e.id]">Edit</a>
              </div>
            </div>
          }
        </div>
      }
    </main>
  `,
})
export default class Dashboard {
  private readonly supabase = inject(SUPABASE);
  private readonly router = inject(Router);
  private readonly ui = inject(AdminUi);

  protected readonly copied = copiedState();
  protected readonly creating = signal(false);

  protected readonly events = resource({
    loader: async () => {
      const { data, error } = await this.supabase
        .from('event_summaries')
        .select('*')
        .order('event_date');
      if (error) throw error;
      return data;
    },
  });

  protected readonly items = computed<EventItem[]>(() => {
    const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
    return (this.events.hasValue() ? this.events.value() : []).map((e) => ({
      id: e.id ?? '',
      slug: e.slug ?? '',
      title: e.title || 'Untitled event',
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
    const { error } = await this.supabase
      .from('events')
      .update({ is_active: active })
      .eq('id', item.id);
    if (error) {
      setActive(!active);
      this.ui.toast("Couldn't update the event. Try again.");
      return;
    }
    this.ui.toast(active ? 'Replies open.' : 'Replies closed. The link now shows “not available”.');
  }

  protected async copy(item: EventItem): Promise<void> {
    if (await this.ui.copy(this.ui.eventUrl(item.slug))) this.copied.mark(item.id);
  }

  /** Creates an inactive event with the database defaults, then opens it in the editor. */
  protected async newEvent(): Promise<void> {
    const taken = new Set(this.items().map((e) => e.slug));
    let slug = 'new-event';
    for (let n = 2; taken.has(slug); n++) slug = `new-event-${n}`;
    const inAMonth = new Date(Date.now() + 30 * 86_400_000).toLocaleDateString('en-CA');

    this.creating.set(true);
    const { data, error } = await this.supabase
      .from('events')
      .insert({
        slug,
        title: 'New event',
        event_date: inAMonth,
        start_time: '18:00',
        end_time: '21:00',
      })
      .select('id')
      .single();
    this.creating.set(false);

    if (error) {
      this.ui.toast("Couldn't create the event. Try again.");
      return;
    }
    this.ui.toast('Event created. It stays inactive until you switch replies on.');
    await this.router.navigate(['/admin/events', data.id]);
  }
}
