import {
  GOAL_CATEGORIES,
  GOAL_TIERS,
  parseGoalInput,
  type GoalInput,
} from "@/server/goals/goal-records";
import {
  LIMITATION_CATEGORIES,
  type OnboardingStep,
} from "@/lib/onboarding/onboarding-contract";

export * from "@/lib/onboarding/onboarding-contract";

export class OnboardingValidationError extends Error {
  constructor() {
    // Intake text is deliberately never included in an exception.
    super("The guided setup details are invalid.");
    this.name = "OnboardingValidationError";
  }
}

export function parseOnboardingStep(value: unknown): OnboardingStep {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 6) {
    throw new OnboardingValidationError();
  }
  return parsed as OnboardingStep;
}

export function parseGoalsPayload(
  formData: FormData,
  advance: boolean,
): { goals: OnboardingGoalPayload[]; advance: boolean } {
  const goals: OnboardingGoalPayload[] = [];
  for (let index = 0; index < 3; index += 1) {
    const title = renderedText(formData, `goalTitle:${index}`).trim();
    if (!title) continue;
    const goal = parseGoalInput({
      title,
      desiredOutcome: text(formData, `goalOutcome:${index}`),
      category: text(formData, `goalCategory:${index}`),
      activityAreas: commaList(
        text(formData, `goalActivities:${index}`),
        10,
        60,
      ),
      startDate: text(formData, `goalStartDate:${index}`),
      targetDate: optionalText(formData, `goalTargetDate:${index}`),
      targetDetail: optionalText(formData, `goalTargetDetail:${index}`),
      targetMetricLabel: optionalText(formData, `goalMetricLabel:${index}`),
      targetMetricValue: optionalText(formData, `goalMetricValue:${index}`),
      targetMetricUnit: optionalText(formData, `goalMetricUnit:${index}`),
      priorityTier: text(formData, `goalTier:${index}`),
      targetRank: optionalNumber(formData, `goalRank:${index}`),
      rationale: optionalText(formData, `goalRationale:${index}`),
      constraints: optionalText(formData, `goalConstraints:${index}`),
    });
    goals.push({
      ...goal,
      targetDate: goal.targetDate ?? "",
      targetDetail: goal.targetDetail ?? "",
      targetMetricLabel: goal.targetMetricLabel ?? "",
      targetMetricValue: goal.targetMetricValue ?? "",
      targetMetricUnit: goal.targetMetricUnit ?? "",
      targetRank: goal.targetRank ?? "",
      rationale: goal.rationale ?? "",
      constraints: goal.constraints ?? "",
    });
  }
  if (goals.length < 1) throw new OnboardingValidationError();
  return { goals, advance };
}

type OnboardingGoalPayload = Omit<
  GoalInput,
  | "targetDate"
  | "targetDetail"
  | "targetMetricLabel"
  | "targetMetricValue"
  | "targetMetricUnit"
  | "targetRank"
  | "rationale"
  | "constraints"
> & {
  targetDate: string;
  targetDetail: string;
  targetMetricLabel: string;
  targetMetricValue: string;
  targetMetricUnit: string;
  targetRank: number | "";
  rationale: string;
  constraints: string;
};

export function parseTrainingPayload(formData: FormData, advance: boolean) {
  const trainingStatus = text(formData, "trainingStatus");
  if (trainingStatus !== "current" && trainingStatus !== "none") {
    throw new OnboardingValidationError();
  }

  const activities: Array<{
    name: string;
    sessionsPerWeek: number;
    durationMinutes: number;
    detail: string;
  }> = [];
  if (trainingStatus === "current") {
    for (let index = 0; index < 10; index += 1) {
      const name = renderedText(formData, `activityName:${index}`).trim();
      if (!name) continue;
      activities.push({
        name: bounded(name, 60),
        sessionsPerWeek: integer(
          formData.get(`activitySessions:${index}`),
          1,
          14,
        ),
        durationMinutes: integer(
          formData.get(`activityDuration:${index}`),
          1,
          1440,
        ),
        detail: optionalBounded(formData.get(`activityDetail:${index}`), 500),
      });
    }
    if (activities.length < 1) throw new OnboardingValidationError();
  }
  return { trainingStatus, activities, advance };
}

export function parseContextPayload(formData: FormData, advance: boolean) {
  const availableDays = formData
    .getAll("availableDays")
    .map((value) => bounded(value, 12));
  if (availableDays.length < 1 || availableDays.length > 7) {
    throw new OnboardingValidationError();
  }
  const accessLabels = commaList(text(formData, "accessLabels"), 10, 60);
  if (accessLabels.length < 1) throw new OnboardingValidationError();
  const units = text(formData, "units");
  if (units !== "metric" && units !== "imperial") {
    throw new OnboardingValidationError();
  }
  return {
    availableDays,
    sessionsPerWeek: integer(formData.get("sessionsPerWeek"), 1, 14),
    durationMinutes: integer(formData.get("durationMinutes"), 5, 1440),
    accessLabels,
    timezoneName: bounded(formData.get("timezoneName"), 100),
    units,
    advance,
  };
}

export function parsePreferencesPayload(formData: FormData, advance: boolean) {
  const preferences = lines(text(formData, "preferences"), 10, 1000);
  return { preferences, advance };
}

export function parseConstraintsPayload(formData: FormData, advance: boolean) {
  const constraints = LIMITATION_CATEGORIES.flatMap((category) => {
    if (formData.get(`constraint:${category}`) !== "on") return [];
    return [
      {
        category,
        detail: optionalBounded(
          formData.get(`constraintDetail:${category}`),
          970,
        ),
      },
    ];
  });
  return { constraints, advance };
}

export function parseReviewPayload(formData: FormData) {
  const ids = formData.getAll("candidateId").map((value) => uuid(value));
  if (new Set(ids).size !== ids.length) throw new OnboardingValidationError();
  return {
    decisions: ids.map((id) => {
      const kind = text(formData, `kind:${id}`);
      const decision = text(formData, `decision:${id}`);
      if (
        (kind !== "goal" && kind !== "memory") ||
        (decision !== "accepted" && decision !== "rejected")
      ) {
        throw new OnboardingValidationError();
      }
      if (decision === "rejected") {
        return {
          kind,
          id,
          decision,
          resolution: null,
          targetId: null,
        };
      }
      const resolution = text(formData, `resolution:${id}`);
      if (
        resolution !== "create" &&
        resolution !== "keep" &&
        resolution !== "update"
      ) {
        throw new OnboardingValidationError();
      }
      return {
        kind,
        id,
        decision,
        resolution,
        targetId:
          resolution === "create" ? null : uuid(formData.get(`targetId:${id}`)),
      };
    }),
  };
}

export function parseExpectedRevision(value: unknown): number {
  return integer(value, 0, Number.MAX_SAFE_INTEGER);
}

export function parseIdempotencyKey(value: unknown): string {
  return uuid(value);
}

export function isoDateToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function browserTimezone(): string {
  return "UTC";
}

export { GOAL_CATEGORIES, GOAL_TIERS };

function commaList(value: string, maxItems: number, maxLength: number) {
  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => bounded(entry, maxLength));
  if (
    values.length > maxItems ||
    new Set(values.map((entry) => entry.toLocaleLowerCase())).size !==
      values.length
  ) {
    throw new OnboardingValidationError();
  }
  return values;
}

function lines(value: string, maxItems: number, maxLength: number) {
  const values = value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => bounded(entry, maxLength));
  if (
    values.length > maxItems ||
    new Set(values.map((entry) => entry.toLocaleLowerCase())).size !==
      values.length
  ) {
    throw new OnboardingValidationError();
  }
  return values;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") throw new OnboardingValidationError();
  return value;
}

function renderedText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (value === null) return "";
  if (typeof value !== "string") throw new OnboardingValidationError();
  return value;
}

function optionalText(formData: FormData, key: string): string | undefined {
  const value = text(formData, key).trim();
  return value || undefined;
}

function optionalNumber(formData: FormData, key: string): number | undefined {
  const value = optionalText(formData, key);
  return value === undefined ? undefined : Number(value);
}

function bounded(value: unknown, maxLength: number): string {
  if (typeof value !== "string") throw new OnboardingValidationError();
  const clean = value.trim();
  if (clean.length < 1 || clean.length > maxLength) {
    throw new OnboardingValidationError();
  }
  return clean;
}

function optionalBounded(value: unknown, maxLength: number): string {
  if (value === null || value === "") return "";
  return bounded(value, maxLength);
}

function integer(value: unknown, min: number, max: number): number {
  const parsed =
    typeof value === "string" && value.trim() ? Number(value) : value;
  if (
    typeof parsed !== "number" ||
    !Number.isSafeInteger(parsed) ||
    parsed < min ||
    parsed > max
  ) {
    throw new OnboardingValidationError();
  }
  return parsed;
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new OnboardingValidationError();
  }
  return value;
}
