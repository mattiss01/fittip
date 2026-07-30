---
description: Mobile-first UI conventions for App Router routes and components
paths:
  - "src/app/**"
  - "src/components/**"
  - "src/features/**"
---

# UI and App Router

- Server Components are the default. Add `"use client"` only for genuine browser interactivity,
  and keep the client boundary as narrow as the interaction requires.
- A `"use client"` file must never import `@/server/**` or a repository —
  `src/architecture/server-boundary.test.ts` fails the build if it does. Core counting,
  lifecycle, ranking, and other business rules live server-side.
- Design for 390px first; the acceptance viewport is exactly `390x844`. Keep safe-area padding,
  visible text labels, touch-sized targets, visible focus states, and a reduced-motion path.
- Layering already resolved by M1-04: dialog above the save dock, save dock above bottom
  navigation, navigation above ordinary content. Do not reintroduce an overlay that covers a
  form action.
- Copy is factual and non-diagnostic. Never imply a completion, score, streak, trend, or
  coaching judgment that the data does not state. Time passing is not completion.
- Every route needs honest `loading`, empty, unavailable-record, `error`, offline, and
  expired-session states with a real recovery action — and none of them may invent training
  facts.
- Redirect targets must pass the allowlist in `src/lib/auth/safe-return.ts`. Never echo a
  private path back to an unauthenticated view.
- Styling is Tailwind v4 plus co-located CSS modules. No component library or new design system
  without an approved ticket.
- When a change materially reshapes React/App Router behavior or visible UI, apply the project
  skills at `.agents/skills/vercel-react-best-practices/SKILL.md` and
  `.agents/skills/frontend-design/SKILL.md`, and record which rules were checked in the ticket
  validation record.
