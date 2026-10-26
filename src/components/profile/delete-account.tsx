"use client";

import { useState } from "react";

import styles from "./delete-account.module.css";

const WORD = "DELETE";

const REFUSALS: Record<string, string> = {
  confirmation:
    "Type DELETE in capitals to delete your account. Nothing was deleted.",
  session: "Your session ended. Sign in again to delete your account.",
  error: "Your account could not be deleted. Nothing was changed; try again.",
};

/**
 * The last section of Settings (owner, 23 Oct 2026; ADR-039). Typing DELETE
 * enables the button; the form posts to the route that deletes the account
 * and signs out.
 */
export function DeleteAccount({ refusal }: { refusal: string | null }) {
  const [typed, setTyped] = useState("");
  // Own keys only: the reason arrives in the address, and `__proto__` or
  // `toString` must not reach the page as a message.
  const message =
    refusal !== null && Object.hasOwn(REFUSALS, refusal)
      ? REFUSALS[refusal]
      : null;

  return (
    <form
      className={styles.form}
      action="/auth/delete-account"
      method="post"
      data-delete-account
    >
      <p>
        This deletes your account and everything in it: your sign-in, profile,
        plans, logs, goals, memory, roadmap and the coach&rsquo;s suggestions.
        It cannot be undone.
      </p>
      {message === null ? null : (
        <p className={styles.refusal} role="alert">
          {message}
        </p>
      )}
      <label className={styles.field} htmlFor="delete-account-confirmation">
        <span>Type {WORD} to confirm</span>
        <input
          id="delete-account-confirmation"
          name="confirmation"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </label>
      <button type="submit" className={styles.delete} disabled={typed !== WORD}>
        Delete my account
      </button>
    </form>
  );
}
