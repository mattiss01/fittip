# ADR-043: A friends beta

**Status:** accepted. The product owner decided it on 12 November 2026. No friend is admitted
until B1, B2 and B3 have merged.

**Date:** 12 November 2026

**Ticket:** "Friends beta", B1 to B4, in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Supersedes:** the friend and owner-only clauses of
[ADR-007](ADR-007-FOUNDER-HOSTED-STAGING.md) (the environment processes only the owner's data;
application access is owner-only; records have no durability promise; M0-03B to M0-06 remain
mandatory before any friend) and the matching clauses of
[ADR-006](ADR-006-LOCAL-OWNER-AI-MVP.md) (friend data prohibited; the same four gates
mandatory). Everything else in both stands.

**Answers:** the consequence in [ADR-013](ADR-013-AI-TRAINING-HISTORY-ELIGIBILITY.md) that
decision 4 "does not survive the pre-friends gate unexamined". It is examined here, and kept.

## Context

FitTip has run for one athlete since July 2026: a public URL, sign-up off, and a single user id
(`FITTIP_OWNER_USER_ID`) admitted by `isAllowedVerifiedUser`. The owner is happy with the app and
wants a few friends to use it, partly to see the coach on bodies and goals other than their own.
The five local test athletes have shown the coach and the per-user data boundary work for
other people, but only on synthetic data.

ADR-006 and ADR-007 made friends wait on four M0 briefs: recovery (M0-03B), a privacy, consent
and deletion design (M0-04), instrumentation and AI controls (M0-05), and a hosted quality
baseline (M0-06). All four are still "proposed". They were written for an open, public product,
before most of FitTip existed, and much of what they asked for has since been built in other
tickets.

## Decision

1. **Three to five friends, each known to the owner personally.** Invitation only. Sign-up stays
   off in FitTip and in Supabase Auth.
2. **Admission is a server-only list of verified user ids**, replacing the single owner id
   (B1). A missing, empty or malformed entry fails closed, as the owner id does today. Admission
   is never decided from email or user metadata. Taking an id off the list ends that person's
   access at once and leaves their data in place.
3. **Accounts are made by hand**, as the owner's was: the owner creates each in the Supabase
   dashboard with a one-time password, passes it on privately, and the friend changes it with
   Change password (ADR-042) on first sign-in. A forgotten password is set by the owner from the
   SQL editor. No mail is sent, so the built-in sender's limits and the missing custom SMTP
   (ADR-022) do not block the beta.
4. **A friend's notes reach the coach in full**, as the owner's do: ADR-013 decision 4 applies
   to everyone. The coach is no worse for a friend than for the owner. The cost is that a
   friend's health text (pain, illness, injury) goes to the AI provider, so decision 5 must say
   exactly that.
5. **No coach call without recorded consent** (B2). Before a person's first coach call they see
   a privacy notice and give a separate yes to the AI processing. Without it the coach is not
   offered; withdrawing it stops calls from then on. The notice says, plainly:
   - what is stored and where: Supabase (Frankfurt), Vercel, and the AI provider, with its
     data-use and retention terms as they actually are, checked when B3 is written;
   - that the owner runs the database and can technically read it, and that FitTip has no
     admin view;
   - that the coach's answers are suggestions, not medical advice;
   - how to delete everything (ADR-039), what stays in backups and for how long, and that an
     export is given on request rather than built.

   This is the part of M0-04 the beta needs. It is not legal advice; whether anyone checks the
   notice is the owner's call.
6. **Friends' data must survive** (B3). From the first admission, ADR-007's "no durability
   promise" and the owner's 13 October 2026 rule that no stored data needs to survive both end:
   a migration carries existing rows forward, and destructive DDL is asked about with the
   friends' data in mind.
7. **Backups are a free weekly dump to the owner's laptop**, plus one before each hosted
   migration, not a paid plan. One dump is restored into the local stack before the first
   invitation, to prove it restores. Old dumps are deleted after the period the notice states.
8. **Every green merge reaches friends at once**, as it reaches the owner today. CI stays the
   gate; there is no separate beta release.
9. **English only for now.** The language switch in `NEXT.md` follows separately.
10. **Spend is unchanged.** The AI ceilings are per person (2 USD a day, 20 USD in all), so a
    friend cannot use up the owner's; the owner pays for every call.

## What the four M0 gates become

- **M0-03B, recovery:** replaced by decision 3 for this beta. Recovery by link stays as ADR-022
  left it.
- **M0-04, privacy, consent and deletion:** narrowed to decision 5. Deletion already exists
  (ADR-039).
- **M0-05, instrumentation and AI controls:** met by what M3 built. Calls are server-side,
  schema-validated, budgeted per person and fail closed (ADR-019, ADR-023). There is no
  analytics sink, and this ADR does not approve one.
- **M0-06, hosted quality baseline:** met by CI (static checks, every migration from zero with
  pgTAP and advisors, 390px browser flows) and by ADR-018's apply rules. Test athletes stay
  local; the founder project holds only real people's data.

The briefs stay in `docs/backlog/M0` as history. A public launch would need them, or their
successors, in full.

## Alternatives considered

- **Flags only for a friend's notes.** Less health text would leave FitTip, but the coach would
  see "pain: yes" without "fine by evening" and back off from non-problems: ADR-013's reason for
  sending the text. Rejected by the owner in favour of consent.
- **Each friend chooses whether notes are sent.** Best of both, but a second coach behaviour to
  build, test and judge. Not now.
- **Custom SMTP before the beta.** Needed for sign-up and reset by link, neither of which a hand-
  made account needs. Deferred until more people are invited.
- **Supabase Pro for backups** (about 25 USD a month, daily backups kept seven days). A new
  recurring cost for five people. Not now.
- **A separate beta release.** A second deployment and two versions to support. Not now.

## Consequences

- The owner holds friends' health data on two machines they control: the hosted database and
  the laptop's dumps. The laptop's disk should be encrypted; B3 checks it.
- The owner becomes the support desk: accounts, forgotten passwords, exports and restores are
  done by hand. This scales to five people and is the trigger to revisit decisions 3 and 7.
- Every product invariant in `CLAUDE.md` already holds per user; nothing in RLS changes. What
  changes is that a slip reaches someone other than the owner, so a careful-lane review now
  reads every change with friends' data in mind.
- `CLAUDE.md` calls FitTip an app "for one athlete". It is reworded when the first friend is
  admitted, not before.
- A friend removed from the list keeps their data until they or the owner delete the account.

## Approval boundary

This ADR approves only the beta above. It does not approve public sign-up, more than five
people, anyone the owner does not know personally, commercial use, analytics, a paid plan, a
custom domain, custom SMTP, or a change to what the coach is sent beyond what ADR-013 and
ADR-023 already allow.
