export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
  second: number;
}

type DateTimeFormatConstructor = typeof Intl.DateTimeFormat;

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

export function getZonedParts(
  date: Date,
  timeZone: string,
  locale = "en-US",
  DateTimeFormat: DateTimeFormatConstructor = Intl.DateTimeFormat
): ZonedParts {
  const formatter = new DateTimeFormat(locale, {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const entries = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = Number(entries.get("hour") ?? "0") % 24;

  return {
    year: Number(entries.get("year")),
    month: Number(entries.get("month")),
    day: Number(entries.get("day")),
    weekday: WEEKDAY_TO_INDEX[entries.get("weekday") ?? "Sun"] ?? 0,
    hour,
    minute: Number(entries.get("minute")),
    second: Number(entries.get("second"))
  };
}

export function getTimezoneOffsetMinutes(
  date: Date,
  timeZone: string,
  DateTimeFormat: DateTimeFormatConstructor = Intl.DateTimeFormat
): number {
  const parts = getZonedParts(date, timeZone, "en-US", DateTimeFormat);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((date.getTime() - asUtc) / 60000);
}

export function dateFromZonedLocalParts(
  timeZone: string,
  year: number,
  month: number,
  day = 1,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
  DateTimeFormat: DateTimeFormatConstructor = Intl.DateTimeFormat
): Date {
  const localAsUtc = Date.UTC(year, month, day, hour, minute, second, millisecond);
  if (Number.isNaN(localAsUtc)) {
    return new Date(Number.NaN);
  }

  let instant = localAsUtc;
  let previousInstant: number | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offset = getTimezoneOffsetMinutes(new Date(instant), timeZone, DateTimeFormat);
    const nextInstant = localAsUtc + offset * 60000;
    if (nextInstant === instant) {
      break;
    }
    if (nextInstant === previousInstant) {
      instant = Math.max(instant, nextInstant);
      break;
    }
    previousInstant = instant;
    instant = nextInstant;
  }

  return new Date(instant);
}

export function getOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes <= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60).toString().padStart(2, "0");
  const minutes = (absolute % 60).toString().padStart(2, "0");
  return `GMT${sign}${hours}${minutes}`;
}

export function formatSpoofedDateString(
  date: Date,
  locale: string,
  timeZone: string,
  DateTimeFormat: DateTimeFormatConstructor = Intl.DateTimeFormat
): string {
  return new DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(date);
}

export function formatSpoofedTimeString(
  date: Date,
  locale: string,
  timeZone: string,
  DateTimeFormat: DateTimeFormatConstructor = Intl.DateTimeFormat
): string {
  return new DateTimeFormat(locale, {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "long"
  }).format(date);
}
