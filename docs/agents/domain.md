# Domain Docs

How the engineering skills should consume this repo's domain documentation when
exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root
- **`docs/decisions/`** — this repo's ADR directory (`ADR-00N-<SLUG>.md`), not
  the conventional `docs/adr/`. Read ADRs that touch the area you're about to
  work in.
- **`docs/product/F-00N-*.md`** — approved feature briefs. They define
  user-visible behaviour and are the contract a ticket implements.
- **`AGENTS.md` § Product invariants** — hard rules that outrank convenience.

If any of these files don't exist, **proceed silently**. Don't flag their
absence; don't suggest creating them upfront. The `/domain-modeling` skill
(reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates
them lazily when terms or decisions actually get resolved. There is currently
no root `CONTEXT.md` — that's expected.

## File structure

Single-context repo:

```
/
├── CONTEXT.md              ← not yet created
├── AGENTS.md               ← working agreement + product invariants
├── docs/
│   ├── decisions/          ← ADRs (ADR-001 … ADR-009)
│   ├── product/            ← feature briefs (F-001 … F-003)
│   ├── backlog/M<n>/       ← tickets and wayfinder efforts
│   └── validation/M<n>/    ← validation records + evidence
└── src/
```

New ADRs go in `docs/decisions/` using the existing
`ADR-0NN-<TICKET-OR-TOPIC>.md` naming, continuing the number sequence.

## Use the glossary's vocabulary

When your output names a domain concept (in a ticket title, a refactor
proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`,
falling back to the vocabulary in `docs/product/DATA-MODEL-OVERVIEW.md` and the
feature briefs. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either
you're inventing language the project doesn't use (reconsider) or there's a
real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR or a product invariant in AGENTS.md,
surface it explicitly rather than silently overriding:

> _Contradicts ADR-009 (M2 goal mutation transaction) — but worth reopening
> because…_

A contradiction with an AGENTS.md product invariant is a stop-and-report, not a
flag: those require product-owner approval to change.
