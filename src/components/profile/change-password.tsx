import { PasswordField } from "@/components/password-field";
import styles from "./change-password.module.css";

const REFUSALS: Record<string, string> = {
  validation:
    "Use matching new passwords with at least 8 characters. Nothing was changed.",
  current: "That is not your current password. Nothing was changed.",
  password:
    "Your new password could not be set. It may be the one you have now; choose another and try again.",
  session: "Your session ended. Sign in again to change your password.",
  error: "Your password could not be changed. Nothing was changed; try again.",
};

/**
 * Settings' Change password (owner, 6 Nov 2026; ADR-042). The form posts to
 * the route that checks the current password, sets the new one and signs the
 * account's other devices out; a refusal comes back here by its key.
 */
export function ChangePassword({ refusal }: { refusal: string | null }) {
  // Own keys only: the reason arrives in the address.
  const message =
    refusal !== null && Object.hasOwn(REFUSALS, refusal)
      ? REFUSALS[refusal]
      : null;

  return (
    <form
      action="/auth/change-password"
      className={`auth-form ${styles.form}`}
      method="post"
    >
      <p className={styles.explainer}>
        Your other devices are signed out once it is changed. This one stays
        signed in.
      </p>
      {message === null ? null : (
        <p className="form-message error" role="alert">
          {message}
        </p>
      )}
      <PasswordField
        autoComplete="current-password"
        id="current-password"
        label="Current password"
        name="current"
      />
      <PasswordField
        autoComplete="new-password"
        id="new-password"
        label="New password"
        minLength={8}
        name="password"
      />
      <PasswordField
        autoComplete="new-password"
        id="confirm-new-password"
        label="Confirm new password"
        minLength={8}
        name="confirmation"
      />
      <button type="submit">Change password</button>
    </form>
  );
}
