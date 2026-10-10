import { TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateLoader } from '@ngx-translate/core';
import { of } from 'rxjs';
import en from '../../../public/i18n/en.json';
import type { PublicEvent } from '../api/models';
import { PublicApi } from '../api/public-api';
import { DEFAULT_THEME } from '../theme';
import { EventPreview } from './event-preview';

const event: PublicEvent = {
  slug: 'new-event',
  title: 'New event',
  description: null,
  event_date: '2026-11-08',
  start_time: '18:00:00',
  end_time: '21:00:00',
  timezone: 'America/Puerto_Rico',
  location_name: null,
  location_address: null,
  location_url: null,
  rsvp_question: 'Will you be joining us?',
  button_text: 'Send RSVP',
  confirmation_message: 'Thanks!',
  notes_enabled: true,
  notes_required: false,
  notes_label: 'Anything we should know?',
  language: 'en',
  theme: {},
};

describe('EventPreview', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService({
          loader: { provide: TranslateLoader, useValue: { getTranslation: () => of(en) } },
          lang: 'en',
        }),
        { provide: PublicApi, useValue: { imageUrl: (path: string) => path } },
      ],
    });
  });

  async function render(active: boolean) {
    const fixture = TestBed.createComponent(EventPreview);
    fixture.componentRef.setInput('event', event);
    fixture.componentRef.setInput('theme', DEFAULT_THEME);
    fixture.componentRef.setInput('active', active);
    fixture.componentRef.setInput('pageUrl', 'https://example.test/rsvp/new-event');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the invite while replies are off, with a note about what guests see', async () => {
    const preview = await render(false);
    expect(preview.querySelector('app-invite form')).not.toBeNull();
    expect(preview.querySelector('app-not-found')).toBeNull();
    expect(preview.querySelector('[role=status].warning')?.textContent).toContain('not available');
  });

  it('drops the note once replies are on', async () => {
    const preview = await render(true);
    expect(preview.querySelector('app-invite form')).not.toBeNull();
    expect(preview.querySelector('.warning')).toBeNull();
  });
});
