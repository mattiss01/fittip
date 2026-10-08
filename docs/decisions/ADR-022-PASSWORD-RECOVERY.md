# ADR-022: A forgotten password is reset by a one-time link that works on any device

**Status:** accepted — the product owner decided it on 8 October 2026.

**Date:** 8 October 2026

**Ticket:** "Forgot password" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Supersedes:** the deferral of forgotten-password and password-reset behavior in
[ADR-005](ADR-005-STAGED-MVP-AUTHENTICATION.md), and the line of
[ADR-007](ADR-007-FOUNDER-HOSTED-STAGING.md) that leaves recovery unapproved for
the hosted environment

**Builds on:** [ADR-003](ADR-003-PUBLIC-EMAIL-PASSWORD-AUTH.md), whose rules for
where a password and its tokens live stay as they are

## Context

ADR-003 required recovery with the first authentication feature. ADR-005 moved
it out so that sign-in could ship, and said a user who forgets a password has
no way back until it exists. That user is now the owner: the hosted environment
has one account and no sign-up, so a forgotten password there means the
database console.

## Decision

Sign-in links to a page that asks for an email address. The address is handed
to Supabase Auth, which sends the mail. FitTip stores nothing: no token, no
request, no record that one was made.

- **One answer.** The page says the same sentence whether the address has an
  account, has none, or the request was rate-limited, so it cannot be used to
  learn who has an account.
- **The link carries its own one-time code** (`token_hash`) and opens a FitTip
  page, not Supabase's verification address. It therefore works in any browser
  on any device (owner). The default link needs a cookie held by the browser
  that asked, which is why a new account's confirmation link fails elsewhere.
  That needs a custom mail template: `supabase/templates/recovery.html` for the
  local stack and CI, and the same text pasted into the hosted project by the
  owner, since no agent can reach hosted Auth settings.
- **Opening the link spends nothing.** The page only shows the form. The code
  is verified in the same request that sets the password, so a mail scanner
  that opens links before the owner does cannot use it up, and no session
  exists in the browser between the two.
- **Order of the reset:** the two passwords are checked first (eight characters
  or more, matching), so a typo does not cost the link; then the code is
  verified; then the runtime policy is asked whether this account may use this
  environment (`requireAllowedVerifiedUser`), so on the hosted app only the
  owner's account can be reset; then the password is set.
- **Every session ends** (owner): the reset signs the account out everywhere,
  this browser included, and lands on sign-in, which says the password is
  changed. The owner signs in with it, as after confirming a new account.

## Consequences

- A device that was signed in keeps working until its access token runs out,
  up to an hour. The global sign-out stops it being renewed; nothing shortens a
  token already issued.
- The code is in the address of the reset page. That page and the request page
  are sent `no-store` and `Referrer-Policy: no-referrer`, and load nothing from
  another origin.
- Hosted mail goes through Supabase's built-in sender, a few mails an hour.
  That is enough for one owner. ADR-005's condition stands: real SMTP, bot
  protection and reviewed rate limits before anyone outside is let in.
- Until the owner pastes the template into the hosted project, the hosted mail
  carries Supabase's default link, which FitTip's page does not accept. It
  fails with "expired or already used" and exposes nothing.
- A new account's confirmation link still works only in the browser that signed
  up. The same approach would fix it; it is a line in `NEXT.md`, not part of
  this decision.

## Alternatives

- **The default link and a callback, as for confirmation.** No template to
  maintain, and it fails on another device. Rejected by the owner.
- **Verify on opening the link, then show the form in a signed-in session.**
  One request fewer to write, but the link is spent by whatever opens it first
  and a session exists before any password was typed.
- **Sign the owner in after the reset.** Rejected by the owner: the link alone
  would then be enough to get in, and signing in proves the new password.
