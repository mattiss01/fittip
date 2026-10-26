import "server-only";

import type { ServerUserClient } from "@/lib/supabase/server-user-client";

/** The word a person types to delete their account (ADR-039). */
export const DELETE_ACCOUNT_WORD = "DELETE";

export type DeleteAccountResult =
  | "deleted"
  /** The word was not typed exactly; nothing was deleted. */
  | "confirmation"
  /** No signed-in person to delete. */
  | "session"
  | "error";

/**
 * Deletes the signed-in person's account and everything in it (ADR-039).
 *
 * The database function is the only path: the application holds no
 * service-role key, and the function acts on `auth.uid()` alone. The word is
 * checked here first so a mistyped one never reaches it; the function checks
 * it again.
 */
export async function deleteOwnAccount(
  client: Pick<ServerUserClient, "rpc">,
  confirmation: unknown,
): Promise<DeleteAccountResult> {
  if (confirmation !== DELETE_ACCOUNT_WORD) return "confirmation";
  const { error } = await client.rpc("delete_my_account", {
    p_confirmation: DELETE_ACCOUNT_WORD,
  });
  if (!error) return "deleted";
  if (error.code === "42501") return "session";
  if (error.code === "22023") return "confirmation";
  return "error";
}
