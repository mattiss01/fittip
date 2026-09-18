# Issue tracker: local markdown

For skills that talk about "the issue tracker" or "publishing a ticket".

Work lives in the repo, not in GitHub Issues. The GitHub remote is for code, PRs,
and Vercel deployments only — do not use its issue tracker.

- **The working list is [`docs/backlog/NEXT.md`](../backlog/NEXT.md)**: a checklist of
  what's next, plus a merge log. "Publish a ticket" means add a line there. "Fetch the
  relevant ticket" means read the matching line and whatever it links.
- A line says what outcome is wanted, and for careful-lane work its constraints and the
  decisions the owner already made. It is not a document; if a line needs more than about
  eight lines, the work is probably two items.
- Specs, where one exists, are feature briefs at `docs/product/F-00N-<SLUG>.md`.
- `docs/backlog/M0`–`M3` and `docs/validation/` are the history of the earlier protocol.
  Read them for context; do not add to them.
- Adding a line is free. Committing the owner to a product, privacy, or spend decision is
  not: propose it and stop.
