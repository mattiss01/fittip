import Link from "next/link";

type Mode = "sign-in" | "sign-up";

export function AuthForm({
  initialMode = "sign-in",
  allowSignUp = true,
  searchParams,
}: {
  initialMode?: Mode;
  allowSignUp?: boolean;
  searchParams?: { checkEmail?: boolean; error?: string };
}) {
  const mode = initialMode;
  const isSignUp = mode === "sign-up";
  const error = searchParams?.error;

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">FitTip / account</p>
      <h1 id="auth-title">
        {isSignUp ? "Start with your next move." : "Welcome back."}
      </h1>
      <p className="auth-intro">
        {isSignUp
          ? "Create a verified personal account. Your training stays yours."
          : "Sign in to your personal FitTip space."}
      </p>

      <form
        action={isSignUp ? "/auth/signup" : "/auth/signin"}
        className="auth-form"
        method="post"
      >
        <label htmlFor="email">Email</label>
        <input
          autoComplete="email"
          id="email"
          name="email"
          required
          type="email"
        />
        <label htmlFor="password">Password</label>
        <input
          autoComplete={isSignUp ? "new-password" : "current-password"}
          id="password"
          minLength={isSignUp ? 8 : undefined}
          name="password"
          required
          type="password"
        />
        {isSignUp ? (
          <>
            <label htmlFor="confirmation">Confirm password</label>
            <input
              autoComplete="new-password"
              id="confirmation"
              minLength={8}
              name="confirmation"
              required
              type="password"
            />
          </>
        ) : null}
        {error ? (
          <p className="form-message error" role="alert">
            {isSignUp && error === "validation"
              ? "Use matching passwords with at least 8 characters."
              : "We could not sign you in with those details."}
          </p>
        ) : null}
        {searchParams?.checkEmail ? (
          <p className="form-message success" role="status">
            Check your email to confirm your FitTip account.
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
