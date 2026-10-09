// Event times and add-to-calendar links, built in the browser (docs/architecture.md, section 7).
// Events store a wall-clock date and time plus an IANA zone; calendars get exact UTC instants.

export interface EventTiming {
  event_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM[:SS]
  end_time: string | null; // null: no end; earlier than start: ends the next day
  timezone: string;
}

export interface CalendarEvent extends EventTiming {
  slug: string;
  title: string;
  description: string | null;
  location_name: string | null;
  location_address: string | null;
}

const HOUR_MS = 3_600_000;
const DEFAULT_DURATION_MS = 3 * HOUR_MS;

const parseDate = (date: string) => date.split('-').map(Number) as [number, number, number];
const parseTime = (time: string) => time.split(':').map(Number) as [number, number];

/** Offset of `timeZone` from UTC at `instant`, in ms (e.g. -4h for Puerto Rico). */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const wall = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return wall - Math.floor(instant / 1000) * 1000;
}

/**
 * Converts a wall-clock date and time in `timeZone` to a UTC instant. The second pass
 * corrects the offset when the first guess lands on the other side of a DST change.
 * Unknown zones fall back to UTC.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = parseDate(date);
  const [h, min] = parseTime(time);
  const wall = Date.UTC(y, m - 1, d, h, min);
  try {
    const first = wall - zoneOffset(wall, timeZone);
    return new Date(wall - zoneOffset(first, timeZone));
  } catch {
    return new Date(wall);
  }
}

export function eventWindow(event: EventTiming): { start: Date; end: Date } {
  const start = zonedTimeToUtc(event.event_date, event.start_time, event.timezone);
  if (!event.end_time) {
    return { start, end: new Date(start.getTime() + DEFAULT_DURATION_MS) };
  }
  let end = zonedTimeToUtc(event.event_date, event.end_time, event.timezone);
  if (end <= start) {
    const [y, m, d] = parseDate(event.event_date);
    const nextDay = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    end = zonedTimeToUtc(nextDay, event.end_time, event.timezone);
  }
  return { start, end };
}

/** Date and time lines in the guest's locale, as the event's own local time. */
export function formatWhen(event: EventTiming, locale?: string): { date: string; time: string } {
  const [y, m, d] = parseDate(event.event_date);
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(Date.UTC(y, m - 1, d));

  const clock = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
  });
  const at = (time: string) => {
    const [h, min] = parseTime(time);
    return clock.format(Date.UTC(y, m - 1, d, h, min));
  };

  const time = event.end_time
    ? `${at(event.start_time)} – ${at(event.end_time)}`
    : at(event.start_time);
  return { date, time };
}

export const locationText = (event: Pick<CalendarEvent, 'location_name' | 'location_address'>) =>
  [event.location_name, event.location_address].filter(Boolean).join(', ');

export const mapsUrl = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

// ---------------------------------------------------------------------------
// Calendar links
// ---------------------------------------------------------------------------

const MAX_DETAILS = 1000; // keeps link URLs well under browser limits

function details(event: CalendarEvent, pageUrl: string): string {
  const description = event.description?.trim() ?? '';
  const room = MAX_DETAILS - pageUrl.length - 8;
  const text = description.length > room ? `${description.slice(0, room - 1)}…` : description;
  return [text, `RSVP: ${pageUrl}`].filter(Boolean).join('\n\n');
}

const query = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

/** 20261114T140000Z */
const compactUtc = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

export function googleCalendarUrl(event: CalendarEvent, pageUrl: string): string {
  const { start, end } = eventWindow(event);
  return `https://calendar.google.com/calendar/render?${query({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${compactUtc(start)}/${compactUtc(end)}`,
    details: details(event, pageUrl),
    location: locationText(event),
  })}`;
}

export function outlookCalendarUrl(event: CalendarEvent, pageUrl: string): string {
  const { start, end } = eventWindow(event);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${query({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: details(event, pageUrl),
    location: locationText(event),
  })}`;
}

// ---------------------------------------------------------------------------
// iCalendar (RFC 5545)
// ---------------------------------------------------------------------------

const escapeText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Folds a content line at 75 octets without splitting a UTF-8 character. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = lines.length === 0 ? 75 : 74; // continuation lines start with a space
    if (octets + size > limit) {
      lines.push(current);
      current = '';
      octets = 0;
    }
    current += char;
    octets += size;
  }
  lines.push(current);
  return lines.join('\r\n ');
}

export function icsFile(event: CalendarEvent, pageUrl: string, now = new Date()): string {
  const { start, end } = eventWindow(event);
  const host = new URL(pageUrl).host;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RSVP//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // Stable per event, so downloading again updates the entry instead of duplicating it.
    `UID:${event.slug}@${host}`,
    `DTSTAMP:${compactUtc(now)}`,
    `DTSTART:${compactUtc(start)}`,
    `DTEND:${compactUtc(end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(details(event, pageUrl))}`,
    `LOCATION:${escapeText(locationText(event))}`,
    `URL:${pageUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
