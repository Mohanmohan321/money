const decimalStringPattern = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/;

function localeSymbol(
  formatter: Intl.NumberFormat,
  type: 'plusSign' | 'minusSign' | 'decimal',
): string {
  const value = type === 'minusSign' ? -1.1 : 1.1;
  return formatter.formatToParts(value).find((part) => part.type === type)?.value ?? (
    type === 'plusSign' ? '+' : type === 'minusSign' ? '-' : '.'
  );
}

export function formatMoney(value: string, locale?: Intl.LocalesArgument): string {
  const match = decimalStringPattern.exec(value);
  if (!match) {
    if (/^[+-]?\d+\.\d{3,}$/.test(value)) {
      throw new TypeError('Money values must use at most two decimal places');
    }
    throw new TypeError('Money value must be a signed decimal string');
  }

  const [, sign, integerPart, fractionalPart = ''] = match;
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: true,
  });
  const symbolFormatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'always',
  });
  const groupedInteger = formatter.format(BigInt(integerPart));
  const localizedFraction = new Intl.NumberFormat(locale, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  }).format(BigInt(fractionalPart.padEnd(2, '0')));
  const signPrefix = sign === '-'
    ? localeSymbol(symbolFormatter, 'minusSign')
    : sign === '+'
      ? localeSymbol(symbolFormatter, 'plusSign')
      : '';

  return `${signPrefix}${groupedInteger}${localeSymbol(symbolFormatter, 'decimal')}${localizedFraction}`;
}

export function formatMonth(month: string, locale?: Intl.LocalesArgument): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new TypeError('Month must use YYYY-MM');

  const [, year, monthNumber] = match;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(Number(year), Number(monthNumber) - 1, 1);
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
