import {
  type CalendarEvent,
  eventWindow,
  formatWhen,
  googleCalendarUrl,
  icsFile,
  outlookCalendarUrl,
  zonedTimeToUtc,
} from './calendar';

const maya: CalendarEvent = {
  slug: 'maya-6',
  title: 'Maya turns 6!',
  description: 'Bouncy castle, pizza; cake, and more.\nSocks on, please!',
  event_date: '2026-11-14',
  start_time: '14:00:00',
  end_time: '17:00:00',
  timezone: 'Europe/London',
  location_name: "Jumpin' Jungle Play Centre",
  location_address: '48 Harbour Road, Brighton BN2 1TR',
};
const pageUrl = 'https://keimdja.github.io/rsvp/maya-6';

describe('zonedTimeToUtc', () => {
  it('converts wall time in zones with and without daylight saving', () => {
    expect(zonedTimeToUtc('2026-11-14', '14:00', 'Europe/London').toISOString()).toBe(
      '2026-11-14T14:00:00.000Z',
    );
    expect(zonedTimeToUtc('2027-06-05', '14:30', 'Europe/London').toISOString()).toBe(
      '2027-06-05T13:30:00.000Z',
    );
    expect(zonedTimeToUtc('2026-12-24', '19:00', 'America/Puerto_Rico').toISOString()).toBe(
      '2026-12-24T23:00:00.000Z',
    );
  });

  it('stays correct on daylight-saving change days', () => {
    // New York springs forward at 02:00 on 8 March 2026; 09:00 is already EDT (UTC-4).
    expect(zonedTimeToUtc('2026-03-08', '09:00', 'America/New_York').toISOString()).toBe(
      '2026-03-08T13:00:00.000Z',
    );
    // ...and falls back on 1 November 2026; 20:00 is EST (UTC-5).
    expect(zonedTimeToUtc('2026-11-01', '20:00', 'America/New_York').toISOString()).toBe(
      '2026-11-02T01:00:00.000Z',
    );
  });

  it('falls back to UTC for an unknown zone', () => {
    expect(zonedTimeToUtc('2026-01-01', '10:00', 'Mars/Olympus').toISOString()).toBe(
      '2026-01-01T10:00:00.000Z',
    );
  });
});

describe('eventWindow', () => {
  it('defaults to three hours when there is no end time', () => {
    const { start, end } = eventWindow({ ...maya, end_time: null });
    expect(end.getTime() - start.getTime()).toBe(3 * 3_600_000);
  });

  it('ends the next day when the end is not after the start', () => {
    const { end } = eventWindow({ ...maya, start_time: '21:00', end_time: '01:00' });
    expect(end.toISOString()).toBe('2026-11-15T01:00:00.000Z');
  });
});

describe('formatWhen', () => {
  it('formats the event in its own local time', () => {
    expect(formatWhen(maya, 'en-US')).toEqual({
      date: 'Saturday, November 14, 2026',
      time: '2:00 PM – 5:00 PM',
    });
    expect(formatWhen({ ...maya, end_time: null }, 'en-US').time).toBe('2:00 PM');
  });
});

describe('calendar links', () => {
  it('builds a Google Calendar link with UTC times', () => {
    const url = new URL(googleCalendarUrl(maya, pageUrl));
    expect(url.searchParams.get('dates')).toBe('20261114T140000Z/20261114T170000Z');
    expect(url.searchParams.get('text')).toBe('Maya turns 6!');
    expect(url.searchParams.get('location')).toBe(
      "Jumpin' Jungle Play Centre, 48 Harbour Road, Brighton BN2 1TR",
    );
    expect(url.searchParams.get('details')).toContain(`RSVP: ${pageUrl}`);
  });

  it('builds an Outlook link with ISO times', () => {
    const url = new URL(outlookCalendarUrl(maya, pageUrl));
    expect(url.searchParams.get('startdt')).toBe('2026-11-14T14:00:00.000Z');
    expect(url.searchParams.get('enddt')).toBe('2026-11-14T17:00:00.000Z');
  });
});

describe('icsFile', () => {
  const ics = icsFile(maya, pageUrl, new Date('2026-10-01T09:00:00Z'));
  const lines = ics.split('\r\n');

  it('uses CRLF line endings and a stable UID', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(lines).toContain('UID:maya-6@keimdja.github.io');
    expect(lines).toContain('DTSTART:20261114T140000Z');
    expect(lines).toContain('DTEND:20261114T170000Z');
  });

  it('escapes commas, semicolons and newlines', () => {
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(
      'DESCRIPTION:Bouncy castle\\, pizza\\; cake\\, and more.\\nSocks on\\, please!',
    );
    expect(unfolded).toContain('SUMMARY:Maya turns 6!');
  });

  it('folds lines at 75 octets without splitting characters', () => {
    const long = icsFile({ ...maya, title: '🎉 Fiesta de cumpleaños '.repeat(8) }, pageUrl);
    const encoder = new TextEncoder();
    for (const line of long.split('\r\n')) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(long).not.toContain('�');
    expect(long.replace(/\r\n /g, '')).toContain(`SUMMARY:${'🎉 Fiesta de cumpleaños '.repeat(8)}`);
  });
});
