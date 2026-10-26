# ADR-039: Deleting an account

**Status:** accepted — the product owner decided it on 23 October 2026.

**Date:** 23 October 2026

**Ticket:** "Delete my account" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-031](ADR-031-DELETING-A-LOG.md) (nothing is removed as a side effect)
and [ADR-002](ADR-002-M0-02-DATA-AUTHORIZATION-BOUNDARY.md) (no service-role key in the
application). It adds a privileged function that removes a person's sign-in, which is
why it is recorded.

## Context

FitTip is to be opened to family and friends. Under the GDPR (Art. 17) a person may have
their data erased, and the privacy review of 22 October 2026 found that this was
impossible even by hand: deleting a user from `auth.users` stopped at
`rolling_plan_activities_personal_fkey`. Every owned table cascades from the account, but
ten links between owned tables deliberately do not, so that a log, a goal's history or a
library activity is never removed as a side effect of something else (ADR-031). Those
links block a single cascading delete.

The application has no service-role key by design (ADR-002), so Supabase's admin API for
deleting a user is not available to it.

## Decision

1. **A person can delete their own account** from the bottom of You → Settings. Typing
   `DELETE` enables the button (owner's choice over a password check or two taps). The
   section says what goes and that it cannot be undone.
2. **One database function does it:** `public.delete_my_account(p_confirmation)`,
   `SECURITY DEFINER` with an empty search path, executable by `authenticated` only. It
   takes no user argument; the owner is `auth.uid()`. It refuses without a caller and
   unless the confirmation is exactly `DELETE`, which the application also checks first.
3. **Deleting really deletes.** In one transaction the function locks the profile,
   removes the caller's rows in an order the protective links allow (logs, proposal
   decisions, goal history, memory, the plan, saved sessions), then deletes the row in
   `auth.users`, whose cascade removes the profile, every remaining owned row (the
   library among them) and Supabase's own sessions and identities. Nothing is kept: no tombstone, no undo.
   The protective links stay as they are; they still stop every other path.
4. **AI spend records are deleted with the account.** The spend ceilings are counted per
   person, so a person who deletes and signs up again starts with a fresh personal limit.
   Accepted for the family beta; an overall ceiling across all users belongs to the AI
   budget ticket.
5. **No special case for the owner.** Deleting the account the hosted app is locked to
   (`FITTIP_OWNER_USER_ID`) leaves the site refusing everyone until that setting changes;
   the owner chose not to guard against it.
6. **After deleting**, the browser's session cookies are cleared without asking the
   server (the user no longer exists there) and the person lands on sign-in with a
   notice that the account and everything in it was deleted.

## What is not deleted by this

Said in the privacy notice: copies in database backups until they roll off, if backups
are enabled; request content OpenAI keeps for up to 30 days for abuse monitoring;
providers' own request and sign-in logs, which hold IP addresses for a short time; and
two Supabase Auth tables in the same database that have no link to the account and are
left by Supabase's own admin delete too: `auth.audit_log_entries` (sign-in events, with
the account id, email and IP address in their payload) and `auth.flow_state` (short-lived
sign-in handshakes). The audit log is a security record kept by Supabase's sign-in
service; how long it is kept is a setting to state in the notice.

## Consequences

- A new owner-callable `SECURITY DEFINER` function: the security advisor reports one more
  `authenticated_security_definer_function_executable`, as for every owner definer.
- The function must learn every new owned table whose links do not cascade. pgTAP proves
  that after a delete no `public` table with a `user_id` holds a row of that person, so a
  new table that blocks or survives the delete fails the suite.
