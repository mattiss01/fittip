import { describe, expect, it } from "vitest";

import type { Completion, CompletionLog } from "./completion-log";
import { readUnloggedSessions, unloggedSessions } from "./unlogged-sessions";

import type {
  RollingPlan,
  RollingPlanSessionCard,
} from "@/server/rolling-plan/rolling-plan";

const TODAY = "2026-11-12";

function card(
  id: string,
  localDate: string,
  extra: Partial<RollingPlanSessionCard> = {},
): RollingPlanSessionCard {
  return {
    id,
    localDate,
    position: 0,
    title: `Session ${id}`,
    sport: "Running",
    status: "active",
    cancelledAt: null,
    seriesId: null,
    occurrenceDate: null,
    hasDiverged: false,
    ...extra,
  };
}

describe("unloggedSessions", () => {
  it("lists past active sessions without a log, oldest first", () => {
    const sessions = [
      card("b", "2026-11-10"),
      card("a", "2026-11-08"),
      card("logged", "2026-11-09"),
      card("cancelled", "2026-11-09", { status: "cancelled" }),
      card("today", TODAY),
      card("ahead", "2026-11-14"),
    ];

    const listed = unloggedSessions(sessions, new Set(["logged"]), TODAY);

    expect(listed.map((session) => session.id)).toEqual(["a", "b"]);
  });

  it("orders a day by its start time, untimed last", () => {
    const listed = unloggedSessions(
      [
        card("untimed", "2026-11-10", { position: 0 }),
        card("evening", "2026-11-10", { position: 1, startTime: "18:00" }),
        card("morning", "2026-11-10", { position: 2, startTime: "07:00" }),
      ],
      new Set(),
      TODAY,
    );

    expect(listed.map((session) => session.id)).toEqual([
      "morning",
      "evening",
      "untimed",
    ]);
  });
});

describe("readUnloggedSessions", () => {
  function sources(sessions: RollingPlanSessionCard[], logs: Completion[]) {
    const reads: { plan: [string, string][]; logs: string[][] } = {
      plan: [],
      logs: [],
    };
    const plan = {
      getPlanCards: async (start: string, end: string) => {
        reads.plan.push([start, end]);
        return {
          planId: "plan",
          revision: 1,
          recoveryDates: [],
          sessions: sessions.filter(
            (session) => session.localDate >= start && session.localDate <= end,
          ),
        };
      },
    } as unknown as RollingPlan;
    const log = {
      findByPlanSessions: async (ids: string[]) => {
        reads.logs.push(ids);
        return logs.filter(
          (completion) =>
            completion.planSessionId !== null &&
            ids.includes(completion.planSessionId),
        );
      },
    } as unknown as CompletionLog;
    return { plan, log, reads };
  }

  it("reads from the first day through yesterday, and a skip settles a session", async () => {
    const { plan, log, reads } = sources(
      [
        card("before", "2026-11-04"),
        card("skipped", "2026-11-06"),
        card("open", "2026-11-07"),
        card("today", TODAY),
      ],
      [
        {
          planSessionId: "skipped",
          status: "skipped",
        } as unknown as Completion,
      ],
    );

    const listed = await readUnloggedSessions(plan, log, TODAY, "2026-11-05");

    expect(reads.plan).toEqual([["2026-11-05", "2026-11-11"]]);
    expect(listed.map((session) => session.id)).toEqual(["open"]);
  });

  it("reads nothing before there is a past day to look at", async () => {
    const { plan, log, reads } = sources([card("today", "2026-11-05")], []);

    expect(
      await readUnloggedSessions(plan, log, "2026-11-05", "2026-11-05"),
    ).toEqual([]);
    expect(reads.plan).toEqual([]);
  });

  it("asks for no logs when nothing in the range is still active", async () => {
    const { plan, log, reads } = sources(
      [card("cancelled", "2026-11-06", { status: "cancelled" })],
      [],
    );

    expect(await readUnloggedSessions(plan, log, TODAY, "2026-11-05")).toEqual(
      [],
    );
    expect(reads.logs).toEqual([]);
  });
});
