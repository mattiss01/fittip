# FitTip data-model overview

**Status:** living planning view — M0 and M1 are accepted; M2-01 is testable
and not yet accepted; later M2 and M3 records remain proposed

This diagram shows the intended ownership and history boundaries. It is a
conceptual overview, not approval of exact table names, columns, migrations, or
transaction mechanisms.

```mermaid
flowchart TB
  AUTH["Supabase Auth user"]

  subgraph M0["M0 — implemented foundation"]
    PROFILE["Profile<br/>user_id, created_at"]
  end

  subgraph M1["M1 — accepted manual planning and tracking"]
    ACTIVITY["Personal activity<br/>owner-created definition"]
    PLAN["Detailed plan version<br/>day_count: 1–7<br/>start/end date, timezone<br/>parent/source version"]
    SESSION["Planned session<br/>date, order, intent, duration, lock"]
    PLANNED_ACTIVITY["Planned activity snapshot<br/>measurement mode, target, units, lock"]
    COMPLETION["Completed session<br/>planned source optional<br/>actual status, time, effort, note"]
    COMPLETED_ACTIVITY["Completed activity snapshot<br/>actual measurements"]
    CORRECTION["Completion correction history<br/>append-only revisions/current pointer"]
  end

  subgraph M2["M2 — goals in development; memory and onboarding proposed"]
    GOAL_COLLECTION["Goal collection<br/>owner revision / compare-and-swap"]
    GOAL["Goal<br/>core/supporting, independent rank, lifecycle"]
    GOAL_EVENT["Goal lifecycle event<br/>explicit terminal-state reopening"]
    MEMORY["Memory item<br/>type, provenance, status, confidence, expiry"]
    INTAKE["Onboarding draft"]
    CANDIDATE["Reviewed candidate<br/>accept / edit / reject"]
  end

  subgraph M3["M3 — proposed AI roadmap and plan proposals"]
    ROADMAP_PROPOSAL["Roadmap proposal<br/>validated, not accepted data"]
    PLAN_PROPOSAL["Selected-horizon plan proposal<br/>requested day_count: 1–7<br/>validated, not accepted data"]
    PROPOSAL_SOURCE["Proposal source references<br/>record ids and versions"]
    ROADMAP_VERSION["Accepted roadmap version"]
  end

  AUTH -->|"owns identity"| PROFILE

  PROFILE -->|"owns"| ACTIVITY
  PROFILE -->|"owns"| PLAN
  PLAN -->|"contains"| SESSION
  SESSION -->|"contains"| PLANNED_ACTIVITY
  ACTIVITY -.->|"optional reusable definition"| PLANNED_ACTIVITY

  PROFILE -->|"owns"| COMPLETION
  SESSION -.->|"source only; never mutated"| COMPLETION
  COMPLETION -->|"contains"| COMPLETED_ACTIVITY
  ACTIVITY -.->|"optional reusable definition"| COMPLETED_ACTIVITY
  COMPLETION -->|"corrected through"| CORRECTION

  PROFILE -->|"owns"| GOAL
  PROFILE -->|"owns"| GOAL_COLLECTION
  PROFILE -->|"owns"| GOAL_EVENT
  GOAL_COLLECTION -->|"versions atomic changes to"| GOAL
  GOAL -->|"reopening records"| GOAL_EVENT
  PROFILE -->|"owns"| MEMORY
  PROFILE -->|"owns"| INTAKE
  INTAKE -->|"produces"| CANDIDATE
  CANDIDATE -.->|"explicit publication only"| GOAL
  CANDIDATE -.->|"explicit publication only"| MEMORY

  PROFILE -->|"owns"| ROADMAP_PROPOSAL
  PROFILE -->|"owns"| PLAN_PROPOSAL
  GOAL -.->|"versioned context"| PROPOSAL_SOURCE
  MEMORY -.->|"versioned context"| PROPOSAL_SOURCE
  PLAN -.->|"versioned context"| PROPOSAL_SOURCE
  COMPLETION -.->|"versioned context"| PROPOSAL_SOURCE
  PROPOSAL_SOURCE --> ROADMAP_PROPOSAL
  PROPOSAL_SOURCE --> PLAN_PROPOSAL

  ROADMAP_PROPOSAL -.->|"explicit acceptance transaction"| ROADMAP_VERSION
  PLAN_PROPOSAL -.->|"explicit acceptance transaction"| PLAN
```

## How to read it

- **M0 is actual:** the public data model starts with an owner profile backed
  by Supabase Auth.
- **M1 is accepted:** a detailed plan version contains exactly
  the user-requested 1–7 consecutive owner-local dates.
- **M2-01 is testable, not accepted:** the ticket branch adds owner-scoped goal,
  collection-revision, and minimal lifecycle-event records. One authenticated
  transaction owns all changes; active core and supporting ranks are separate.
- Planned sessions/activities and completed sessions/activities are separate.
  The dotted source link never converts or rewrites a plan into an actual.
- Personal activity definitions are reusable, but every historical plan and
  completion retains its own immutable snapshot.
- Goals and memory enter planning context only after accepted M2 behavior.
- AI outputs are proposals. Only an explicit reviewed acceptance transaction
  can create an accepted roadmap or detailed plan version.
- Every owned persisted record has an explicit `user_id`; relationships,
  server authorization, and RLS also enforce same-owner access.

## Milestone ownership

| Model area | Owning ticket | Current status |
|---|---|---|
| Profile and ownership baseline | M0-02 / M0-02-C1 | accepted |
| Detailed plans, planned/actual separation, personal activities | [M1-01](../backlog/M1/M1-01-TRAINING-RECORDS-FOUNDATION.md) | accepted |
| Manual selected-horizon plan behavior | [M1-02](../backlog/M1/M1-02-SELECTABLE-HORIZON-PLANNING.md) | accepted |
| Factual logging and correction history | [M1-03](../backlog/M1/M1-03-QUICK-TRAINING-LOGGING.md) | accepted |
| Goals | [M2-01](../backlog/M2/M2-01-GOAL-MODEL-VALIDATION.md) | testable |
| Memory | [M2-02](../backlog/M2/M2-02-MEMORY-MODEL-MANAGEMENT.md) | proposed |
| Guided-onboarding candidates and explicit publication | [M2-03](../backlog/M2/M2-03-INTAKE-FACT-REVIEW.md) | proposed |
| AI proposal/source records | [M3-01](../backlog/M3/M3-01-LOCAL-AI-ADAPTER-CONTROLS.md), [M3-02](../backlog/M3/M3-02-ROADMAP-PROPOSAL.md), [M3-03](../backlog/M3/M3-03-SELECTED-HORIZON-PLAN-PROPOSAL.md) | proposed |
| Proposal edit and explicit acceptance | [M3-04](../backlog/M3/M3-04-PLAN-EDIT-LOCK-ACCEPTANCE.md) | proposed |

## Approval boundary

The visual records the current intended shape. M2-01's exact testable
contract is governed by its approved ticket, ADR-009, migration, and validation
record; it is not accepted until exact-commit review and product-owner
acceptance. M2-02 and M2-03 must still approve their exact tables, fields,
ownership/RLS policies, history, expiry, and publication transactions before
migrations are implemented.
