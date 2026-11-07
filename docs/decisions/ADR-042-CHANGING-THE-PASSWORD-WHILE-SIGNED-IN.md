# ADR-042: Changing the password while signed in

**Status:** accepted. The product owner decided it on 6 November 2026.

**Date:** 6 November 2026

**Ticket:** "Change password in Settings" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-003](ADR-003-PUBLIC-EMAIL-PASSWORD-AUTH.md) (where a password and its
tokens live) and [ADR-022](ADR-022-PASSWORD-RECOVERY.md) (a forgotten password is reset by a
one-time link). It is recorded because it adds a second way to set a password, and a sign-in
that never becomes the browser's session.

## Context

Until now a password could only be changed by asking for a reset link (ADR-022), even by an
owner who is signed in and knows it. Settings became a list of pages on 6 November 2026, and
the owner asked for "Change password" as one of them.

Supabase Auth's `updateUser` sets a new password for whoever holds the session. It does not
ask for the current one: the project's `secure_password_change` is off, and turning it on
would ask for a mailed nonce instead, which the hosted project cannot send with a template of
ours yet (ADR-022, Consequences).

## Decision

1. **The current password is asked and checked first** (owner's choice over the new one
   alone). Otherwise anyone holding an unlocked, signed-in phone could lock the owner out.
2. **It is checked by a sign-in that never becomes the browser's session.** The route signs
   in with the session's own email address (never one from the form) on a client with no
   cookies and no stored session. It then signs that client out at once. A wrong password
   changes nothing, and Auth's sign-in rate limit applies to guesses.
3. **The new password is set on the browser's own session.** After that, every other session
   of the account ends in the same step, as Auth does it, and this one stays (owner's
   choice; checked against the local stack on 6 November 2026). The route asks for the
   others' sign-out again as a backstop, and its answer does not change the message. Settings
   then says "Password changed".
4. **A route, not a Server Action** (`POST /auth/change-password`), like
   `/auth/delete-account`, because it writes the session cookies on the response it returns.
   It refuses a request from another origin. Every outcome is a fixed key in the address,
   mapped to fixed copy, so nothing typed comes back.
5. **A reset by link is unchanged.** It still ends every session, this one included. Whoever
   opens a reset link may not be the person who was signed in; whoever changes the password
   here proved they were by typing the current one.

## Consequences

- A second path sets a password. Both share the 8-character rule
  (`validateSignUpCredentials`); Auth's own minimum is the backstop. Only Auth's
  `invalid_credentials` is called a wrong current password; a rate limit or an outage says
  the password could not be changed just now.
- The check sign-in creates a session that lives for one request. It is signed out
  immediately, and the sign-out of the other sessions in step 3 ends it again if that failed.
- "Signed out" means their sessions are revoked, so none of them can refresh. A device keeps
  the access token it already holds until it expires (`jwt_expiry`, an hour) where the
  project signs tokens with asymmetric keys, since `getClaims` then checks them without
  asking Auth. With a shared secret it asks Auth, which refuses an ended session at once. A
  reset by link (ADR-022) has always behaved the same way.
- Nothing is stored by FitTip: no password, no attempt count, no record of the change beyond
  Auth's own.
