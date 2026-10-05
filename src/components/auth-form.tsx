import Link from "next/link";

import { PasswordField } from "@/components/password-field";
import { safeAuthReturn } from "@/lib/auth/safe-return";

type Mode = "sign-in" | "sign-up";

export function AuthForm({
  initialMode = "sign-in",
  allowSignUp = true,
  searchParams,
}: {
  initialMode?: Mode;
  allowSignUp?: boolean;
  searchParams?: {
    checkEmail?: boolean;
    /** The confirmation link was opened and the account is confirmed. */
    confirmed?: boolean;
    error?: string;
    next?: string;
  };
}) {
  const mode = initialMode;
  const isSignUp = mode === "sign-up";
  const error = searchParams?.error;

  // After "Create account" there is nothing left to fill in, so the form is
  // not shown again, empty, over a line of small print (owner, 5 Oct 2026):
  // the page says one thing and its one button goes back to sign-in.
  if (isSignUp && searchParams?.checkEmail) {
    return (
      <section className="auth-card" aria-labelledby="auth-title" role="status">
        <p className="eyebrow">FitTip</p>
        <h1 id="auth-title">Check your email</h1>
        <p className="auth-intro">
          We sent you a link to confirm your account. Open it in this browser,
          then sign in and setup starts.
        </p>
        <Link className="auth-action" href="/">
          Back to sign in
        </Link>
      </section>
    );
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">FitTip</p>
      <h1 id="auth-title">{isSignUp ? "Join FitTip" : "Welcome back"}</h1>

      <form
        action={isSignUp ? "/auth/signup" : "/auth/signin"}
        className="auth-form"
        method="post"
      >
        {searchParams?.next ? (
          <input
            name="next"
            type="hidden"
            value={safeAuthReturn(searchParams.next)}
          />
        ) : null}
        <label htmlFor="email">Email</label>
        <input
          autoComplete="email"
          id="email"
          name="email"
          required
          type="email"
        />
        <PasswordField
          autoComplete={isSignUp ? "new-password" : "current-password"}
          id="password"
          label="Password"
          minLength={isSignUp ? 8 : undefined}
          name="password"
        />
        {isSignUp ? (
          <PasswordField
            autoComplete="new-password"
            id="confirmation"
            label="Confirm password"
            minLength={8}
            name="confirmation"
          />
        ) : null}
        {!isSignUp && searchParams?.confirmed && !error ? (
          <p className="form-message success" role="status">
            Your account is confirmed. Sign in to get started.
          </p>
        ) : null}
        {error ? (
          <p className="form-message error" role="alert">
            {isSignUp && error === "validation"
              ? "Use matching passwords with at least 8 characters."
              : "We could not sign you in with those details."}
          </p>
        ) : null}
        <button type="submit">{isSignUp ? "Create account" : "Sign in"}</button>
      </form>

      {allowSignUp ? (
        <Link className="text-button" href={isSignUp ? "/" : "/signup"}>
          {isSignUp
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </Link>
      ) : null}
    </section>
  );
}
