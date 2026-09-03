import { DateTime } from 'luxon';

export interface UtcRange {
  from: Date;
  toExclusive: Date;
}

export interface OptionalUtcRange {
  from?: Date;
  toExclusive?: Date;
}

function parseStrictLocalValue(
  value: string,
  format: string,
  pattern: RegExp,
  errorMessage: string,
  timezone: string,
): DateTime {
  if (!pattern.test(value)) {
    throw new Error(errorMessage);
  }

  const parsed = DateTime.fromFormat(value, format, {
    zone: timezone,
    setZone: true,
  });
  if (!parsed.isValid || parsed.toFormat(format) !== value) {
    throw new Error(errorMessage);
  }
  return parsed;
}

function parseLocalDate(value: string, label: 'from' | 'to', timezone: string): DateTime {
  return parseStrictLocalValue(
    value,
    'yyyy-MM-dd',
    /^\d{4}-\d{2}-\d{2}$/,
    `Invalid \`${label}\` date`,
    timezone,
  ).startOf('day');
}

function toUtcDate(value: DateTime): Date {
  return value.toUTC().toJSDate();
}

export function localDateRange(
  from: string,
  to: string | undefined,
  timezone: string,
): UtcRange {
  const start = parseLocalDate(from, 'from', timezone);
  const end = parseLocalDate(to ?? from, 'to', timezone).plus({ days: 1 });

  return { from: toUtcDate(start), toExclusive: toUtcDate(end) };
}

export function localDateBounds(
  from: string | undefined,
  to: string | undefined,
  timezone: string,
): OptionalUtcRange {
  return {
    ...(from ? { from: toUtcDate(parseLocalDate(from, 'from', timezone)) } : {}),
    ...(to
      ? { toExclusive: toUtcDate(parseLocalDate(to, 'to', timezone).plus({ days: 1 })) }
      : {}),
  };
}

export function monthRange(month: string, timezone: string): UtcRange {
  const start = parseStrictLocalValue(
    month,
    'yyyy-MM',
    /^\d{4}-\d{2}$/,
    'Invalid month',
    timezone,
  ).startOf('month');

  return {
    from: toUtcDate(start),
    toExclusive: toUtcDate(start.plus({ months: 1 })),
  };
}

export function yearRange(year: string, timezone: string): UtcRange {
  const start = parseStrictLocalValue(
    year,
    'yyyy',
    /^\d{4}$/,
    'Invalid year',
    timezone,
  ).startOf('year');

  return {
    from: toUtcDate(start),
    toExclusive: toUtcDate(start.plus({ years: 1 })),
  };
}

export function weekRangeContaining(localDate: string, timezone: string): UtcRange {
  const start = parseStrictLocalValue(
    localDate,
    'yyyy-MM-dd',
    /^\d{4}-\d{2}-\d{2}$/,
    'Invalid local date',
    timezone,
  ).startOf('week');

  return {
    from: toUtcDate(start),
    toExclusive: toUtcDate(start.plus({ weeks: 1 })),
  };
}

export function dashboardRanges(now: Date, timezone: string) {
  const localNow = DateTime.fromJSDate(now, { zone: timezone });
  const dayStart = localNow.startOf('day');
  const weekStart = localNow.startOf('week');
  const monthStart = localNow.startOf('month');

  return {
    today: {
      from: toUtcDate(dayStart),
      toExclusive: toUtcDate(dayStart.plus({ days: 1 })),
    },
    week: {
      from: toUtcDate(weekStart),
      toExclusive: toUtcDate(weekStart.plus({ weeks: 1 })),
    },
    month: {
      from: toUtcDate(monthStart),
      toExclusive: toUtcDate(monthStart.plus({ months: 1 })),
    },
  };
}

export function analyticsRange(
  period: 'day' | 'week' | 'month' | 'year',
  now: Date,
  timezone: string,
  from?: string,
  to?: string,
) {
  const localNow = DateTime.fromJSDate(now, { zone: timezone });
  const defaults = {
    day: {
      from: localNow.startOf('day').minus({ days: 29 }),
      toExclusive: localNow.startOf('day').plus({ days: 1 }),
    },
    week: {
      from: localNow.startOf('week').minus({ weeks: 11 }),
      toExclusive: localNow.startOf('week').plus({ weeks: 1 }),
    },
    month: {
      from: localNow.startOf('month').minus({ months: 11 }),
      toExclusive: localNow.startOf('month').plus({ months: 1 }),
    },
    year: {
      from: localNow.startOf('year').minus({ years: 4 }),
      toExclusive: localNow.startOf('year').plus({ years: 1 }),
    },
  }[period];

  const localFrom = from ? parseLocalDate(from, 'from', timezone) : defaults.from;
  const localToExclusive = to
    ? parseLocalDate(to, 'to', timezone).plus({ days: 1 })
    : defaults.toExclusive;

  if (localFrom >= localToExclusive) {
    throw new Error('`from` must be on or before `to`');
  }

  return {
    from: toUtcDate(localFrom),
    toExclusive: toUtcDate(localToExclusive),
    fromLabel: localFrom.toFormat('yyyy-MM-dd'),
    toLabel: localToExclusive.minus({ days: 1 }).toFormat('yyyy-MM-dd'),
  };
}
