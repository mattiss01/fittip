export const GOAL_CATEGORIES = [
  "performance_event",
  "skill",
  "strength",
  "endurance",
  "mobility",
  "body_composition",
  "recovery_general_fitness",
  "other",
] as const;

export const GOAL_TIERS = ["core", "supporting"] as const;

export type GoalCategory = (typeof GOAL_CATEGORIES)[number];
export type GoalTier = (typeof GOAL_TIERS)[number];

export type GoalInput = {
  title: string;
  desiredOutcome: string;
  category: GoalCategory;
  activityAreas: string[];
  startDate: string;
  targetDate?: string;
  targetDetail?: string;
  targetMetricLabel?: string;
  targetMetricValue?: string;
  targetMetricUnit?: string;
  priorityTier: GoalTier;
  targetRank?: number;
  rationale?: string;
  constraints?: string;
};

export class GoalValidationError extends Error {
  constructor() {
    super("The goal details are invalid.");
    this.name = "GoalValidationError";
  }
}

export function parseGoalInput(value: unknown): GoalInput {
  if (!isRecord(value)) throw new GoalValidationError();

  const title = boundedRequired(value.title, 120);
  const desiredOutcome = boundedRequired(value.desiredOutcome, 1000);
  const category = enumValue(value.category, GOAL_CATEGORIES);
  const priorityTier = enumValue(value.priorityTier, GOAL_TIERS);
  const startDate = isoDate(value.startDate);
  const targetDate = optionalIsoDate(value.targetDate);
  if (targetDate && targetDate < startDate) throw new GoalValidationError();

  const activityAreas = Array.isArray(value.activityAreas)
    ? value.activityAreas.map((area) => boundedRequired(area, 60))
    : [];
  if (
    activityAreas.length > 10 ||
    new Set(activityAreas.map((area) => area.toLocaleLowerCase())).size !==
      activityAreas.length
  ) {
    throw new GoalValidationError();
  }

  const targetMetricLabel = optionalBounded(value.targetMetricLabel, 80);
  const targetMetricValue = optionalBounded(value.targetMetricValue, 120);
  const targetMetricUnit = optionalBounded(value.targetMetricUnit, 40);
  if (
    (targetMetricLabel === undefined) !== (targetMetricValue === undefined) ||
    (targetMetricUnit !== undefined && targetMetricLabel === undefined)
  ) {
    throw new GoalValidationError();
  }

  const targetRank =
    value.targetRank === undefined || value.targetRank === null
      ? undefined
      : integer(value.targetRank, 1, priorityTier === "core" ? 3 : 32767);

  return {
    title,
    desiredOutcome,
    category,
    activityAreas,
    startDate,
    ...(targetDate ? { targetDate } : {}),
    ...optional("targetDetail", optionalBounded(value.targetDetail, 500)),
    ...optional("targetMetricLabel", targetMetricLabel),
    ...optional("targetMetricValue", targetMetricValue),
    ...optional("targetMetricUnit", targetMetricUnit),
    priorityTier,
    ...(targetRank === undefined ? {} : { targetRank }),
    ...optional("rationale", optionalBounded(value.rationale, 500)),
    ...optional("constraints", optionalBounded(value.constraints, 1000)),
  };
}

export function parseExpectedRevision(value: unknown): number {
  return integer(value, 0, Number.MAX_SAFE_INTEGER);
}

export function parseGoalId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new GoalValidationError();
  }
  return value;
}

export function parseGoalTier(value: unknown): GoalTier {
  return enumValue(value, GOAL_TIERS);
}

export function parseOrderedGoalIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new GoalValidationError();
  const ids = value.map(parseGoalId);
  if (new Set(ids).size !== ids.length) throw new GoalValidationError();
  return ids;
}

function boundedRequired(value: unknown, max: number): string {
  if (typeof value !== "string") throw new GoalValidationError();
  const clean = value.trim();
  if (clean.length < 1 || clean.length > max) throw new GoalValidationError();
  return clean;
}

function optionalBounded(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return boundedRequired(value, max);
}

function isoDate(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) {
    throw new GoalValidationError();
  }
  return value;
}

function optionalIsoDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return isoDate(value);
}

function integer(value: unknown, min: number, max: number): number {
  const parsed =
    typeof value === "string" && value !== "" ? Number(value) : value;
  if (
    typeof parsed !== "number" ||
    !Number.isSafeInteger(parsed) ||
    parsed < min ||
    parsed > max
  ) {
    throw new GoalValidationError();
  }
  return parsed;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  options: T,
): T[number] {
  if (typeof value !== "string" || !options.includes(value)) {
    throw new GoalValidationError();
  }
  return value;
}

function optional<Key extends string>(
  key: Key,
  value: string | undefined,
): { [K in Key]?: string } {
  return value === undefined
    ? {}
    : ({ [key]: value } as { [K in Key]: string });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
