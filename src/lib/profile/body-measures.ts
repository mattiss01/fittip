/**
 * Height, weight and age as the profile holds them (owner, 5 Oct 2026).
 *
 * Everything is stored metric: centimetres to one decimal, kilograms to two.
 * The units system says only how a value is shown and typed, so switching it
 * never rewrites a measurement.
 */
export const UNITS_SYSTEMS = ["metric", "imperial"] as const;
export type UnitsSystem = (typeof UNITS_SYSTEMS)[number];

export const HEIGHT_CM_RANGE = { min: 50, max: 272 } as const;
export const WEIGHT_KG_RANGE = { min: 20, max: 400 } as const;

const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;
const KG_PER_POUND = 0.45359237;

export function feetAndInchesToCm(feet: number, inches: number): number {
  return round((feet * INCHES_PER_FOOT + inches) * CM_PER_INCH, 1);
}

/** Whole inches, which is how a height is said; 5 ft 12 never appears. */
export function cmToFeetAndInches(cm: number): {
  feet: number;
  inches: number;
} {
  const total = Math.round(cm / CM_PER_INCH);
  return {
    feet: Math.floor(total / INCHES_PER_FOOT),
    inches: total % INCHES_PER_FOOT,
  };
}

export function poundsToKg(pounds: number): number {
  return round(pounds * KG_PER_POUND, 2);
}

export function kgToPounds(kg: number): number {
  return round(kg / KG_PER_POUND, 1);
}

/**
 * The units a browser's language suggests. Three countries use pounds and
 * feet day to day; everywhere else is metric. It is a starting value the
 * owner sees and can change, never a silent decision.
 */
export function unitsForLocale(locale: string | undefined): UnitsSystem {
  if (!locale) return "metric";
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return region === "US" || region === "LR" || region === "MM"
      ? "imperial"
      : "metric";
  } catch {
    return "metric";
  }
}

/**
 * Whole years between two calendar dates (`YYYY-MM-DD`). Someone born on
 * 29 February has their birthday on 1 March in other years.
 */
export function ageOn(birthDate: string, today: string): number {
  const [birthYear, birthMonthDay] = splitYear(birthDate);
  const [year, monthDay] = splitYear(today);
  return year - birthYear - (monthDay < birthMonthDay ? 1 : 0);
}

function splitYear(isoDate: string): [number, string] {
  return [Number(isoDate.slice(0, 4)), isoDate.slice(5)];
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
