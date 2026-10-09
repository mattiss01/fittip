import "server-only";

import { HEIGHT_CM_RANGE, WEIGHT_KG_RANGE } from "@/lib/profile/body-measures";
import { GENDERS } from "@/lib/profile/profile-contract";
import {
  SESSIONS_PER_WEEK_RANGE,
  WEEKDAY_LABELS,
  WEEKDAYS,
} from "@/lib/training/training-setup";
import type {
  CoachAIAthleteReference,
  CoachAITrainingSetupReference,
  CoachAIWeekdayName,
} from "@/server/ai/contracts";

/**
 * ADR-023: what a coaching AI may read of the owner's profile.
 *
 * Deny by default, as ADR-012 does for goals and ADR-013 for training history.
 * The profile holds a name, a birth date, a time zone, a units choice, a list
 * of sports and the state of guided setup; none of those is copied here, and
 * nothing spreads the record, so a column added to the profile later is
 * invisible to a provider until this file and ADR-023 change together.
 *
 * Two things leave:
 *
 * - **The athlete's basics**: age in whole years, gender, height and the
 *   latest weight. The birth date stays behind; the coach needs how old, not
 *   which day. The name is never read by this module at all.
 * - **The training setup**: how often, when not, where and with what. It left
 *   the coach's sight on 6 October 2026, when setup stopped writing these as
 *   memory notes, and nothing had put it back.
 *
 * It lives outside `src/server/ai` for the reason the other data-shaping
 * modules do: `server-boundary.test.ts` keeps repositories out of that module,
 * and this file's input is a repository record.
 */

/** The profile fields assembly is handed, already owner-scoped. */
export type CoachProfileRecords = {
  birthDate: string | null;
  gender: string | null;
  heightCm: number | null;
  latestWeightKg: number | null;
  training: {
    sessionsPerWeek: number | null;
    unavailableDays: readonly string[];
    availabilityNote: string | null;
    trainingPlaces: readonly string[];
    homeEquipment: readonly string[];
  };
};

export type CoachProfileSelection = {
  athlete: CoachAIAthleteReference;
  trainingSetup: CoachAITrainingSetupReference;
};

/**
 * An owner with no profile row yet: nothing known, nothing set up. Built on
 * each call, so no caller holds lists another one could change.
 */
export function emptyCoachProfile(): CoachProfileSelection {
  return {
    athlete: { age: null, gender: null, heightCm: null, weightKg: null },
    trainingSetup: {
      sessionsPerWeek: null,
      unavailableDays: [],
      availabilityNote: null,
      trainingPlaces: [],
      homeEquipment: [],
    },
  };
}

export function selectCoachProfileContext(
  records: CoachProfileRecords | null | undefined,
  today: string,
): CoachProfileSelection {
  if (!records) return emptyCoachProfile();
  const training = records.training;

  return {
    athlete: {
      age: ageInYears(records.birthDate, today),
      // A stored value outside the ones the app knows is not given.
      gender: GENDERS.find((gender) => gender === records.gender) ?? null,
      // The ranges are the forms' own. The database does not hold the
      // columns to them, so a value from outside is not given rather than
      // sent as though the athlete had entered it.
      heightCm: within(records.heightCm, HEIGHT_CM_RANGE),
      weightKg: within(records.latestWeightKg, WEIGHT_KG_RANGE),
    },
    trainingSetup: {
      sessionsPerWeek: within(
        training.sessionsPerWeek,
        SESSIONS_PER_WEEK_RANGE,
      ),
      unavailableDays: WEEKDAYS.filter((day) =>
        training.unavailableDays.includes(day),
      ).map((day): CoachAIWeekdayName => WEEKDAY_LABELS[day]),
      // Nothing here is cut to fit. The text is the owner's and they curate
      // it, so a setup too large to send refuses with its name in
      // `context.ts`, as goals and memory do, rather than losing its end
      // without a word.
      availabilityNote: text(training.availabilityNote),
      trainingPlaces: names(training.trainingPlaces),
      homeEquipment: names(training.homeEquipment),
    },
  };
}

/**
 * Whole years on the owner's own today. Null for a date that is missing,
 * malformed, in the future, or further back than anyone trains from: a wrong
 * age is worse for a coach than none.
 */
function ageInYears(birthDate: string | null, today: string): number | null {
  if (
    birthDate === null ||
    !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(today)
  ) {
    return null;
  }
  const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  // Not yet had this year's birthday: month and day compare as text.
  const age = today.slice(5) < birthDate.slice(5) ? years - 1 : years;
  return age >= 0 && age <= 120 ? age : null;
}

function within(
  value: number | null,
  range: { min: number; max: number },
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= range.min &&
    value <= range.max
    ? value
    : null;
}

function text(value: string | null): string | null {
  if (value === null) return null;
  const clean = value.trim();
  return clean.length === 0 ? null : clean;
}

function names(values: readonly string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}
