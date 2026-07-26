export type CredentialValidation =
  | { valid: true }
  | { valid: false; message: string };

export const INVALID_CREDENTIALS_MESSAGE =
  "We could not sign you in with those details.";

export function validateSignUpCredentials(
  password: string,
  confirmation: string,
): CredentialValidation {
  if (password.length < 8) {
    return {
      valid: false,
      message: "Use at least 8 characters for your password.",
    };
  }

  if (password !== confirmation) {
    return { valid: false, message: "Your passwords do not match." };
  }

  return { valid: true };
}

export function mapSignInError(): string {
  return INVALID_CREDENTIALS_MESSAGE;
}
