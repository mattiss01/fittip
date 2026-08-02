import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRepositoryMock, redirectMock, revalidatePathMock } = vi.hoisted(
  () => ({
    createRepositoryMock: vi.fn(),
    redirectMock: vi.fn(),
    revalidatePathMock: vi.fn(),
  }),
);

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock(
  "@/server/repositories/onboarding-repository",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/server/repositories/onboarding-repository")
      >();
    return { ...actual, createOnboardingRepository: createRepositoryMock };
  },
);

import { INITIAL_ONBOARDING_ACTION_STATE } from "./action-state";
import { changeOnboardingAction } from "./actions";
import { OnboardingDatabaseValidationError } from "@/server/repositories/onboarding-repository";

describe("onboarding actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves the one rendered goal row and returns the named finish redirect", async () => {
    const apply = vi.fn().mockResolvedValue({
      draft_id: "54000000-0000-4000-8000-000000000001",
      draft_revision: 1,
      result: "saved",
    });
    createRepositoryMock.mockResolvedValue({ apply });

    const result = await changeOnboardingAction(
      INITIAL_ONBOARDING_ACTION_STATE,
      goalForm(),
    );

    expect(result).toMatchObject({
      status: "saved",
      message: "This step was saved.",
      redirectTo: "/home/you",
      nextStep: 1,
    });
    expect(apply).toHaveBeenCalledWith({
      operation: "save_goals",
      expectedDraftRevision: 0,
      payload: {
        advance: false,
        goals: [
          {
            title: "Finish a calm 10K",
            desiredOutcome: "Run the autumn event with even pacing.",
            category: "other",
            activityAreas: ["Running"],
            startDate: "2026-08-02",
            targetDate: "",
            targetDetail: "",
            targetMetricLabel: "",
            targetMetricValue: "",
            targetMetricUnit: "",
            priorityTier: "core",
            targetRank: 1,
            rationale: "",
            constraints: "",
          },
        ],
      },
    });
    expect(revalidatePathMock).toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith("/home/you");
  });

  it("returns an actionable validation state instead of claiming a redirect", async () => {
    createRepositoryMock.mockResolvedValue({
      apply: vi.fn().mockRejectedValue(new OnboardingDatabaseValidationError()),
    });

    const result = await changeOnboardingAction(
      INITIAL_ONBOARDING_ACTION_STATE,
      goalForm(),
    );

    expect(result).toMatchObject({
      status: "validation",
      message:
        "Check the highlighted step. Nothing from this attempt was saved.",
    });
    expect(result.redirectTo).toBeUndefined();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("lets the framework redirect escape the persistence error mapper", async () => {
    const frameworkRedirect = new Error("NEXT_REDIRECT");
    createRepositoryMock.mockResolvedValue({
      apply: vi.fn().mockResolvedValue({
        draft_id: "54000000-0000-4000-8000-000000000001",
        draft_revision: 1,
        result: "saved",
      }),
    });
    redirectMock.mockImplementationOnce(() => {
      throw frameworkRedirect;
    });

    await expect(
      changeOnboardingAction(INITIAL_ONBOARDING_ACTION_STATE, goalForm()),
    ).rejects.toBe(frameworkRedirect);
  });
});

function goalForm() {
  const form = new FormData();
  form.set("operation", "save_goals");
  form.set("expectedDraftRevision", "0");
  form.set("step", "1");
  form.set("intent", "finish");
  form.set("goalTitle:0", "Finish a calm 10K");
  form.set("goalOutcome:0", "Run the autumn event with even pacing.");
  form.set("goalCategory:0", "other");
  form.set("goalActivities:0", "Running");
  form.set("goalStartDate:0", "2026-08-02");
  form.set("goalTargetDate:0", "");
  form.set("goalTargetDetail:0", "");
  form.set("goalMetricLabel:0", "");
  form.set("goalMetricValue:0", "");
  form.set("goalMetricUnit:0", "");
  form.set("goalTier:0", "core");
  form.set("goalRank:0", "1");
  form.set("goalRationale:0", "");
  form.set("goalConstraints:0", "");
  return form;
}
