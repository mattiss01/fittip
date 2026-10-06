import type { UnitsSystem } from "@/lib/profile/body-measures";
import type { SetupStateView } from "@/lib/setup/setup-steps";
import type { TrainingSetupView } from "@/lib/training/training-setup";

export const GENDERS = ["female", "male", "other"] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS = {
  female: "Female",
  male: "Male",
  other: "Other",
} as const satisfies Record<Gender, string>;

/**
 * What "About you" and "Your sports" show and change (owner, 5 Oct 2026).
 * `null` is a detail the owner has not given. Measures are metric, whatever
 * the units say; the weight is the latest entry of the history.
 */
export type ProfileDetailsView = {
  displayName: string | null;
  birthDate: string | null;
  gender: Gender | null;
  unitsSystem: UnitsSystem | null;
  heightCm: number | null;
  timezoneName: string | null;
  sports: string[];
  latestWeightKg: number | null;
  /** How often, when not, where and with what (owner, 6 Oct 2026). */
  training: TrainingSetupView;
  /** Where guided setup stands for this account. */
  setup: SetupStateView;
};

export type WeightEntryView = {
  /** The owner's day the weight belongs to, `YYYY-MM-DD`. */
  measuredOn: string;
  weightKg: number;
};
