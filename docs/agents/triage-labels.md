# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those
roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the
corresponding label string from this table.

## How a label is applied here

This repo has no label system — tickets are markdown files. Record the role as
a `Triage:` line near the top of the ticket file:

```
Triage: ready-for-agent
```

**Triage is not the delivery lifecycle.** It answers "has a maintainer looked
at this, and is it specified enough to act on?" The `Status` column in
`docs/backlog/M<n>/M<n>-BACKLOG.md` answers "how far through delivery is it?"
and is governed by the product-owner approval gates in AGENTS.md.

`ready-for-agent` therefore means *well specified*, not *approved*. It does not
authorise a builder — only a product-owner move to `approved` does that.

Edit the right-hand column to match whatever vocabulary you actually use.
