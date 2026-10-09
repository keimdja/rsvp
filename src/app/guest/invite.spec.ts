import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateLoader } from '@ngx-translate/core';
import { of } from 'rxjs';
import en from '../../../public/i18n/en.json';
import es from '../../../public/i18n/es.json';
import { I18n } from '../i18n';
import { SUPABASE, type PublicEvent } from '../supabase';
import { DEFAULT_THEME } from '../theme';
import { Invite } from './invite';
import { RsvpForm } from './rsvp-form';

const event: PublicEvent = {
  slug: 'maya-6',
  title: 'Maya turns 6!',
  description: null,
  event_date: '2026-11-14',
  start_time: '14:00:00',
  end_time: '17:00:00',
  timezone: 'Europe/London',
  location_name: 'Casa Abuela',
  location_address: '48 Harbour Road',
  rsvp_question: '¿Nos acompañas?',
  button_text: 'Enviar respuesta',
  confirmation_message: '¡Gracias!',
  notes_enabled: true,
  notes_required: false,
  notes_label: '¿Algo que debamos saber?',
  language: 'es',
  theme: {},
};

@Component({
  imports: [Invite, RsvpForm],
  template: `
    <app-invite [event]="event()" [theme]="theme" [framed]="framed()">
      <app-rsvp-form [event]="event()" />
    </app-invite>
  `,
})
class Host {
  readonly event = signal(event);
  readonly framed = signal(false);
  readonly theme = DEFAULT_THEME;
}

describe('Invite', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // App language stays English: the invite must still follow the event's language.
        provideTranslateService({
          loader: {
            provide: TranslateLoader,
            useValue: { getTranslation: (l: string) => of(l === 'es' ? es : en) },
          },
          fallbackLang: 'en',
          lang: 'en',
        }),
        { provide: SUPABASE, useValue: {} },
      ],
    });
  });

  async function render(language: string, framed = false) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.event.set({ ...event, language });
    fixture.componentInstance.framed.set(framed);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders its labels, the projected form and the date in the event language', async () => {
    const page = await render('es');
    const text = page.textContent!.replace(/\s+/g, ' ');
    expect(page.querySelector('app-invite')!.getAttribute('lang')).toBe('es');
    for (const label of [
      'Cuándo',
      'Dónde',
      'Abrir en Mapas',
      'Tu nombre',
      'Sí',
      'Quizás',
      'Opcional',
    ]) {
      expect(text).toContain(label);
    }
    expect(text).toContain('sábado, 14 de noviembre de 2026');
  });

  it('uses English for English events', async () => {
    const text = (await render('en')).textContent!.replace(/\s+/g, ' ');
    for (const label of ['When', 'Where', 'Open in Maps', 'Your name', 'Maybe']) {
      expect(text).toContain(label);
    }
    expect(text).toContain('Saturday, November 14, 2026');
  });

  it("uses the guest's own choice over the event language, except in the admin preview", async () => {
    TestBed.inject(I18n).chosen.set('en');

    const page = await render('es');
    expect(page.textContent).toContain('When');
    expect(page.querySelector('app-language-switch')).not.toBeNull();

    const preview = await render('es', true);
    expect(preview.textContent).toContain('Cuándo');
    expect(preview.querySelector('app-language-switch')).toBeNull();
  });
});
