"use server";

import { revalidatePath } from "next/cache";

import type { ProfileActionState } from "./profile-action-state";

import { isoDateInTimezone } from "@/lib/date/local-date";
import { UNITS_SYSTEMS } from "@/lib/profile/body-measures";
import {
  parseProfileDetails,
  parseProfileSports,
  ProfileDetailsValidationError,
} from "@/server/profile/profile-records";
import {
  createProfileRepository,
  parseTimezoneName,
  ProfileAuthenticationError,
  ProfileValidationError,
  type ProfileRepository,
} from "@/server/repositories/profile-repository";

/**
 * "About you", from guided setup and from Settings (owner, 5 Oct 2026). It
 * does not ask for the time zone or the units: the form sends what the
 * browser says, the zone only while the profile has none, and both are
 * changed under App settings. The zone is read first, because it decides
 * which day is today: the latest birthday accepted and the day a weight is
 * recorded for. Nothing is written until everything sent has been checked.
 */
export async function saveProfileDetailsAction(
  previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  return run(previous, "Your details are saved.", async (profiles) => {
    const submittedZone = formData.get("timezoneName");
    const chosenZone =
      typeof submittedZone === "string" && submittedZone.trim() !== ""
        ? parseTimezoneName(submittedZone)
        : null;
    const timezoneName =
      chosenZone ?? (await profiles.ensureCurrentProfile()).timezoneName;
    const today = isoDateInTimezone(new Date(), timezoneName ?? "UTC");
    const details = parseProfileDetails(formData, today);
    if (chosenZone !== null) await profiles.confirmTimezone(chosenZone);
    await profiles.saveDetails(details, today);
  });
}

/** App settings on Settings: the units and the time zone, changed on purpose. */
export async function saveAppSettingsAction(
  previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  return run(previous, "Your settings are saved.", async (profiles) => {
    const timezoneName = parseTimezoneName(formData.get("timezoneName"));
    const unitsSystem = UNITS_SYSTEMS.find(
      (units) => units === formData.get("unitsSystem"),
    );
    if (!unitsSystem) throw new ProfileDetailsValidationError();
    await profiles.confirmTimezone(timezoneName);
    await profiles.saveUnits(unitsSystem);
  });
}

export async function saveProfileSportsAction(
  previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  return run(previous, "Your sports are saved.", (profiles) =>
    profiles.saveSports(parseProfileSports(formData)),
  );
}

export async function deleteWeightEntryAction(
  previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  return run(previous, "The weight was removed.", async (profiles) => {
    const measuredOn = formData.get("measuredOn");
    if (
      typeof measuredOn !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(measuredOn)
    ) {
      throw new ProfileDetailsValidationError();
    }
    await profiles.deleteWeightEntry(measuredOn);
  });
}

async function run(
  previous: ProfileActionState,
  saved: string,
  change: (profiles: ProfileRepository) => Promise<void>,
): Promise<ProfileActionState> {
  const result = (
    status: ProfileActionState["status"],
    message: string,
  ): ProfileActionState => ({
    status,
    message,
    submission: previous.submission + 1,
  });

  try {
    await change(await createProfileRepository());
  } catch (error) {
    if (
      error instanceof ProfileDetailsValidationError ||
      error instanceof ProfileValidationError
    ) {
      return result(
        "validation",
        "Check the details and try again. Nothing from this attempt was saved.",
      );
    }
    if (error instanceof ProfileAuthenticationError) {
      return result(
        "session",
        "Your session ended. Sign in again before changing your details.",
      );
    }
    return result(
      "error",
      "Your details could not be saved. Reload and try again.",
    );
  }

  revalidatePath("/home/you/onboarding");
  revalidatePath("/home/you/settings");
  return result("saved", saved);
}
