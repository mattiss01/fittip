import { redirect } from "next/navigation";

import { PasswordField } from "@/components/password-field";

export const dynamic = "force-dynamic";

/**
 * Where a reset link lands (ADR-022). Opening it spends nothing: the link's
 * code rides along in the form and is verified by the request that sets the
 * password, so whatever opens the mail's links first cannot use it up.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; error?: string }>;
}) {
  const params = await searchParams;
  const tokenHash = params.token_hash;
  if (typeof tokenHash !== "string" || tokenHash === "") {
    redirect("/forgot-password?error=link");
  }

  return (
    <main>
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">FitTip</p>
        <h1 id="auth-title">Set a new password</h1>
        <form action="/auth/reset" className="auth-form" method="post">
          <input name="token_hash" type="hidden" value={tokenHash} />
          <PasswordField
            autoComplete="new-password"
            id="password"
            label="New password"
            minLength={8}
            name="password"
          />
          <PasswordField
            autoComplete="new-password"
            id="confirmation"
            label="Confirm new password"
            minLength={8}
            name="confirmation"
          />
          {params.error === "validation" ? (
            <p className="form-message error" role="alert">
              Use matching passwords with at least 8 characters.
            </p>
          ) : null}
          <button type="submit">Change password</button>
        </form>
      </section>
    </main>
  );
}
