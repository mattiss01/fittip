import { describe, expect, it } from "vitest";

import {
  isExampleProposal,
  stagedItemCount,
  unresolvedItemCount,
} from "@/lib/plan/plan-proposal-view";
import type { PlanProposalItemView } from "@/lib/plan/plan-proposal-view";
import {
  parseExpectedPlanRevision,
  parsePlanDayCount,
  parsePlanProposalId,
  parsePlanProposalItemDecision,
  parsePlanProposalItemOrdinal,
  PlanProposalValidationError,
} from "@/server/plan-proposal/plan-proposal-records";

/**
 * The parsers stand between a public endpoint and the database, so what they
 * refuse matters as much as what they accept. None of them is the only check —
 * every value they pass is checked again by a function that derives its own
 * owner — but a bad value should be refused before it costs a round trip.
 */

const PROPOSAL_ID = "7c160000-0000-4000-8000-000000000030";

describe("parsePlanProposalId", () => {
  it("accepts a canonical uuid, trimmed", () => {
    expect(parsePlanProposalId(` ${PROPOSAL_ID} `)).toBe(PROPOSAL_ID);
  });

  it.each([null, "", "not-a-uuid", "7c160000-0000-4000-8000", 4 as never])(
    "refuses %p",
    (value) => {
      expect(() => parsePlanProposalId(value as never)).toThrow(
        PlanProposalValidationError,
      );
    },
  );
});

describe("parsePlanProposalItemOrdinal", () => {
  it.each([
    ["0", 0],
    ["27", 27],
    ["5", 5],
  ] as const)("accepts %s", (value, expected) => {
    expect(parsePlanProposalItemOrdinal(value)).toBe(expected);
  });

  // 28 is one past the largest a proposal can hold: seven days of three
  // sessions plus seven recovery-day labels.
  it.each(["-1", "28", "1.5", "", "one", null])("refuses %p", (value) => {
    expect(() => parsePlanProposalItemOrdinal(value)).toThrow(
      PlanProposalValidationError,
    );
  });
});

describe("parsePlanProposalItemDecision", () => {
  it.each(["proposed", "staged", "rejected"] as const)(
    "accepts %s",
    (value) => {
      expect(parsePlanProposalItemDecision(value)).toBe(value);
    },
  );

  it.each(["applied", "discarded", "", "STAGED", null])(
    "refuses %p",
    (value) => {
      expect(() => parsePlanProposalItemDecision(value)).toThrow(
        PlanProposalValidationError,
      );
    },
  );
});

describe("parseExpectedPlanRevision", () => {
  it("accepts zero, which is the revision of a plan that does not exist yet", () => {
    expect(parseExpectedPlanRevision("0")).toBe(0);
  });

  it.each(["-1", "1.5", "", null])("refuses %p", (value) => {
    expect(() => parseExpectedPlanRevision(value)).toThrow(
      PlanProposalValidationError,
    );
  });
});

describe("parsePlanDayCount", () => {
  it.each([
    ["1", 1],
    ["7", 7],
  ] as const)("accepts %s", (value, expected) => {
    expect(parsePlanDayCount(value)).toBe(expected);
  });

  it.each(["0", "8", "3.5", "", null])("refuses %p", (value) => {
    expect(() => parsePlanDayCount(value)).toThrow(PlanProposalValidationError);
  });
});

describe("counting what the owner has decided", () => {
  const items = [
    item(0, "staged"),
    item(1, "rejected"),
    item(2, "proposed"),
    item(3, "staged"),
  ];

  it("counts an undecided item as unresolved, and nothing else", () => {
    expect(unresolvedItemCount(items)).toBe(1);
  });

  it("counts only what would actually be added", () => {
    expect(stagedItemCount(items)).toBe(2);
  });

  it("treats an empty proposal as resolved", () => {
    expect(unresolvedItemCount([])).toBe(0);
  });
});

describe("isExampleProposal", () => {
  /**
   * The label rests on the stored provider code, never on `origin`. A proposal
   * the built-in coach wrote is a real record and a real plan change, so it has
   * to say what wrote it wherever it is shown.
   */
  it("labels a fixture-authored proposal", () => {
    expect(isExampleProposal("fixture")).toBe(true);
  });

  it("does not label a provider-authored one", () => {
    expect(isExampleProposal("openai")).toBe(false);
  });
});

function item(
  ordinal: number,
  decision: PlanProposalItemView["decision"],
): PlanProposalItemView {
  return {
    ordinal,
    kind: "session",
    localDate: "2026-09-21",
    decision,
    title: "Easy run",
    sport: "Running",
    intent: null,
    expectedDurationMinutes: 45,
    rationale: "Because.",
    contentIndex: ordinal,
  };
}
