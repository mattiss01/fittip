import Link from "next/link";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  link: "That link has expired or was already used. Ask for a new one.",
  password:
    "The password could not be changed. Ask for a new link and choose a password you have not used here.",
};

/**
 * Where a forgotten password starts (ADR-022). After the address is sent the
 * page says one thing whether or not it has an account, and the form is not
 * shown again over it, as after "Create account".
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? ERRORS[params.error] : undefined;

  if (params.sent === "1") {
    return (
      <main>
        <section
          className="auth-card"
          aria-labelledby="auth-title"
          role="status"
        >
          <p className="eyebrow">FitTip</p>
          <h1 id="auth-title">Check your email</h1>
          <p className="auth-intro">
            If that address has an account, a link to set a new password is on
            its way. It works once, for an hour, on any device.
          </p>
          <Link className="auth-action" href="/">
            Back to sign in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">FitTip</p>
        <h1 id="auth-title">Forgot your password?</h1>
        <p className="auth-intro">
          Enter the email you sign in with and we send you a link to set a new
          one.
        </p>
        <form action="/auth/forgot" className="auth-form" method="post">
          <label htmlFor="email">Email</label>
          <input
            autoComplete="email"
            id="email"
            name="email"
            required
            type="email"
          />
          {error ? (
            <p className="form-message error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit">Send the link</button>
        </form>
        <Link className="text-button" href="/">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
