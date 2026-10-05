import {
  feetAndInchesToCm,
  HEIGHT_CM_RANGE,
  poundsToKg,
  UNITS_SYSTEMS,
  WEIGHT_KG_RANGE,
  type UnitsSystem,
} from "@/lib/profile/body-measures";
import {
  SPORT_NAME_MAX_LENGTH,
  SPORTS_MAX_COUNT,
} from "@/lib/sports/sport-presets";

export const GENDERS = ["female", "male", "other"] as const;
export type Gender = (typeof GENDERS)[number];

/**
 * "About you" as it is saved (owner, 5 Oct 2026). Only the name is required;
 * `null` means the owner left the field empty, which clears what was stored.
 * The weight is not a profile column: a value given here becomes that day's
 * entry in the weight history.
 */
export type ProfileDetailsInput = {
  displayName: string;
  birthDate: string | null;
  gender: Gender | null;
  unitsSystem: UnitsSystem;
  heightCm: number | null;
  weightKg: number | null;
};

export class ProfileDetailsValidationError extends Error {
  constructor() {
    // What was typed is deliberately never included in an exception.
    super("The profile details are invalid.");
    this.name = "ProfileDetailsValidationError";
  }
}

const EARLIEST_BIRTH_DATE = "1900-01-01";

/**
 * `today` is the owner's own day, so a birthday of today is accepted wherever
 * they are and tomorrow's is not.
 */
export function parseProfileDetails(
  formData: FormData,
  today: string,
): ProfileDetailsInput {
  const displayName = text(formData, "displayName").trim();
  if (displayName.length < 1 || displayName.length > 80) {
    throw new ProfileDetailsValidationError();
  }

  const birthDate = text(formData, "birthDate").trim() || null;
  if (
    birthDate !== null &&
    (!isIsoDate(birthDate) ||
      birthDate < EARLIEST_BIRTH_DATE ||
      birthDate > today)
  ) {
    throw new ProfileDetailsValidationError();
  }

  const gender = text(formData, "gender") || null;
  if (gender !== null && !isOneOf(gender, GENDERS)) {
    throw new ProfileDetailsValidationError();
  }

  const unitsSystem = text(formData, "unitsSystem");
  if (!isOneOf(unitsSystem, UNITS_SYSTEMS)) {
    throw new ProfileDetailsValidationError();
  }

  return {
    displayName,
    birthDate,
    gender,
    unitsSystem,
    heightCm: within(height(formData, unitsSystem), HEIGHT_CM_RANGE),
    weightKg: within(weight(formData, unitsSystem), WEIGHT_KG_RANGE),
  };
}

/**
 * The sports the owner ticked or added, in the order sent. A name given twice
 * (a preset ticked and the same word typed) is kept once rather than refused.
 */
export function parseProfileSports(formData: FormData): string[] {
  const sports: string[] = [];
  const seen = new Set<string>();
  for (const value of formData.getAll("sports")) {
    if (typeof value !== "string") throw new ProfileDetailsValidationError();
    const name = value.trim().replace(/\s+/g, " ");
    if (name === "") continue;
    // A comma separates sports where they are still typed as a list.
    if (name.length > SPORT_NAME_MAX_LENGTH || name.includes(",")) {
      throw new ProfileDetailsValidationError();
    }
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sports.push(name);
  }
  if (sports.length > SPORTS_MAX_COUNT) {
    throw new ProfileDetailsValidationError();
  }
  return sports;
}

function height(formData: FormData, units: UnitsSystem): number | null {
  if (units === "metric") return number(formData, "heightCm");
  const feet = number(formData, "heightFeet");
  const inches = number(formData, "heightInches");
  if (feet === null && inches === null) return null;
  if (
    !Number.isInteger(feet ?? 0) ||
    (feet ?? 0) < 0 ||
    (inches ?? 0) < 0 ||
    (inches ?? 0) >= 12
  ) {
    throw new ProfileDetailsValidationError();
  }
  return feetAndInchesToCm(feet ?? 0, inches ?? 0);
}

function weight(formData: FormData, units: UnitsSystem): number | null {
  if (units === "metric") {
    const kg = number(formData, "weightKg");
    return kg === null ? null : Math.round(kg * 100) / 100;
  }
  const pounds = number(formData, "weightLb");
  return pounds === null ? null : poundsToKg(pounds);
}

function within(
  value: number | null,
  range: { min: number; max: number },
): number | null {
  if (value !== null && (value < range.min || value > range.max)) {
    throw new ProfileDetailsValidationError();
  }
  return value;
}

/**
 * An empty or absent field is `null`. A comma is read as the decimal mark, as
 * it is typed on a German keyboard.
 */
function number(formData: FormData, key: string): number | null {
  const value = formData.get(key);
  if (value === null) return null;
  if (typeof value !== "string") throw new ProfileDetailsValidationError();
  const clean = value.trim().replace(",", ".");
  if (clean === "") return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(clean)) {
    throw new ProfileDetailsValidationError();
  }
  return Number(clean);
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (value === null) return "";
  if (typeof value !== "string") throw new ProfileDetailsValidationError();
  return value;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function isOneOf<const Options extends readonly string[]>(
  value: string,
  options: Options,
): value is Options[number] {
  return options.includes(value);
}
