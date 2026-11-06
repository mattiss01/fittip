"use server";

import { revalidatePath } from "next/cache";

import { isSportSwatch } from "@/lib/sports/sport-colours";
import { keepsAsSport, tidySportName } from "@/lib/sports/sport-presets";
import {
  createProfileRepository,
  ProfileAuthenticationError,
  ProfileValidationError,
  SportMissingError,
  SportNameInvalidError,
  SportNameTakenError,
  type ProfileRepository,
} from "@/server/repositories/profile-repository";

/**
 * The owner's sports in Settings (owner, 6 Nov 2026): add one by name, rename
 * it everywhere, give it another colour, or take it off the list. Each is one
 * change, called from the row it belongs to rather than sent as a form, and
 * answers with what the row should say.
 */
export type SportActionResult =
  | { status: "saved" }
  | { status: "refused" | "session" | "error"; message: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function addSportAction(
  name: unknown,
): Promise<SportActionResult> {
  return run(async (profiles) => profiles.addSport(sportName(name)));
}

/**
 * Renames the sport on every session, log and goal that names it, too. Onto
 * a sport the owner already has, only with `merge`, once they have said so.
 */
export async function renameSportAction(
  id: unknown,
  name: unknown,
  merge: unknown = false,
): Promise<SportActionResult> {
  return run(async (profiles) =>
    profiles.renameSport(sportId(id), sportName(name), merge === true),
  );
}

export async function setSportColourAction(
  id: unknown,
  colour: unknown,
): Promise<SportActionResult> {
  return run(async (profiles) => {
    if (!isSportSwatch(colour)) throw new SportNameInvalidError();
    await profiles.setSportColour(sportId(id), colour);
  });
}

/** The list entry only: its sessions and logs keep the sport, drawn grey. */
export async function deleteSportAction(
  id: unknown,
): Promise<SportActionResult> {
  return run(async (profiles) => profiles.deleteSport(sportId(id)));
}

function sportId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new SportMissingError();
  }
  return value;
}

function sportName(value: unknown): string {
  if (typeof value !== "string") throw new SportNameInvalidError();
  const name = tidySportName(value);
  if (!keepsAsSport(name)) throw new SportNameInvalidError();
  return name;
}

async function run(
  change: (profiles: ProfileRepository) => Promise<void>,
): Promise<SportActionResult> {
  try {
    await change(await createProfileRepository());
  } catch (error) {
    if (error instanceof SportNameTakenError) {
      return { status: "refused", message: "You already have that sport." };
    }
    if (error instanceof SportMissingError) {
      return {
        status: "refused",
        message:
          "That sport is no longer on your list. Reload to see it as it is.",
      };
    }
    if (
      error instanceof SportNameInvalidError ||
      error instanceof ProfileValidationError
    ) {
      return {
        status: "refused",
        message:
          "A sport is a name of up to 60 characters, without a comma, and you can have up to 100.",
      };
    }
    if (error instanceof ProfileAuthenticationError) {
      return {
        status: "session",
        message:
          "Your session ended. Sign in again before changing your sports.",
      };
    }
    return {
      status: "error",
      message: "Your sports could not be changed. Reload and try again.",
    };
  }
  // Every page under Home draws sports in their colours from the layout.
  revalidatePath("/home", "layout");
  return { status: "saved" };
}
