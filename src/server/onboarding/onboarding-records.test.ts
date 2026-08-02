import { describe, expect, it } from "vitest";

import {
  OnboardingValidationError,
  parseConstraintsPayload,
  parseContextPayload,
  parseGoalsPayload,
  parseReviewPayload,
  parseTrainingPayload,
} from "./onboarding-records";

describe("onboarding payload parsing", () => {
  it("maps a goal through the accepted goal validator", () => {
    const form = new FormData();
    form.set("goalTitle:0", "Finish a calm 10K");
    form.set("goalOutcome:0", "Run the autumn event with even pacing.");
    form.set("goalCategory:0", "performance_event");
    form.set("goalActivities:0", "Running, Strength");
    form.set("goalStartDate:0", "2026-08-02");
    form.set("goalTargetDate:0", "2026-10-18");
    form.set("goalTargetDetail:0", "");
    form.set("goalMetricLabel:0", "");
    form.set("goalMetricValue:0", "");
    form.set("goalMetricUnit:0", "");
    form.set("goalTier:0", "core");
    form.set("goalRank:0", "1");
    form.set("goalRationale:0", "");
    form.set("goalConstraints:0", "");
    expect(parseGoalsPayload(form, true)).toEqual({
      advance: true,
      goals: [
        expect.objectContaining({
          title: "Finish a calm 10K",
          activityAreas: ["Running", "Strength"],
          priorityTier: "core",
          targetRank: 1,
          targetDetail: "",
          targetMetricLabel: "",
          targetMetricValue: "",
          targetMetricUnit: "",
          rationale: "",
          constraints: "",
        }),
      ],
    });
  });

  it("requires an explicit current-training answer and bounded activities", () => {
    const form = new FormData();
    form.set("trainingStatus", "current");
    form.set("activityName:0", "Easy running");
    form.set("activitySessions:0", "3");
    form.set("activityDuration:0", "40");
    form.set("activityDetail:0", "Mostly conversational.");
    expect(parseTrainingPayload(form, false)).toEqual({
      trainingStatus: "current",
      advance: false,
      activities: [
        {
          name: "Easy running",
          sessionsPerWeek: 3,
          durationMinutes: 40,
          detail: "Mostly conversational.",
        },
      ],
    });
  });

  it("keeps context structured and rejects duplicate labels", () => {
    const form = new FormData();
    form.append("availableDays", "Monday");
    form.append("availableDays", "Saturday");
    form.set("sessionsPerWeek", "3");
    form.set("durationMinutes", "50");
    form.set("accessLabels", "Road, Home weights");
    form.set("timezoneName", "Europe/Berlin");
    form.set("units", "metric");

    expect(parseContextPayload(form, true)).toMatchObject({
      availableDays: ["Monday", "Saturday"],
      accessLabels: ["Road", "Home weights"],
      timezoneName: "Europe/Berlin",
    });

    form.set("accessLabels", "Road, road");
    expect(() => parseContextPayload(form, true)).toThrow(
      OnboardingValidationError,
    );
  });

  it("maps only selected limitation categories and infers no severity", () => {
    const form = new FormData();
    form.set("constraint:pain_injury", "on");
    form.set(
      "constraintDetail:pain_injury",
      "Avoid jumping while the ankle settles.",
    );
    form.set("constraintDetail:illness_recovery", "Not selected.");
    form.set("constraintDetail:unusual_fatigue", "");
    form.set("constraintDetail:other", "");

    expect(parseConstraintsPayload(form, true)).toEqual({
      advance: true,
      constraints: [
        {
          category: "pain_injury",
          detail: "Avoid jumping while the ankle settles.",
        },
      ],
    });
  });

  it("requires every review decision and supplies no owner or provenance", () => {
    const id = "54000000-0000-4000-8000-000000000101";
    const form = new FormData();
    form.append("candidateId", id);
    form.set(`kind:${id}`, "memory");
    form.set(`decision:${id}`, "accepted");
    form.set(`resolution:${id}`, "create");
    form.set(`targetId:${id}`, "");

    expect(parseReviewPayload(form)).toEqual({
      decisions: [
        {
          kind: "memory",
          id,
          decision: "accepted",
          resolution: "create",
          targetId: null,
        },
      ],
    });
    expect(JSON.stringify(parseReviewPayload(form))).not.toMatch(
      /userId|provenance|confidence|author/i,
    );
  });

  it("never echoes rejected intake text in validation errors", () => {
    const marker = "synthetic-private-error-marker";
    const form = new FormData();
    form.set("trainingStatus", "current");
    form.set("activityName:0", marker.repeat(20));
    form.set("activitySessions:0", "3");
    form.set("activityDuration:0", "40");
    form.set("activityDetail:0", "");
    for (let index = 1; index < 10; index += 1) {
      form.set(`activityName:${index}`, "");
      form.set(`activitySessions:${index}`, "1");
      form.set(`activityDuration:${index}`, "30");
      form.set(`activityDetail:${index}`, "");
    }

    try {
      parseTrainingPayload(form, true);
      throw new Error("expected validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(OnboardingValidationError);
      expect((error as Error).message).not.toContain(marker);
    }
  });
});
