import { redirect } from "next/navigation";

import { PlanEditor } from "@/components/planning/plan-editor";
import type {
  MeasurementMode,
  PlanningInitialState,
} from "@/features/planning/planning-types";
import {
  createTrainingRecordRepository,
  TrainingRecordAuthenticationError,
} from "@/server/repositories/training-record-repository";

export default async function PlanPage() {
  const repository = await createTrainingRecordRepository();

  let initialState: PlanningInitialState;
  try {
    const [current, personalActivities] = await Promise.all([
      repository.getCurrentManualPlan(),
      repository.listActivePersonalActivities(),
    ]);

    initialState = {
      plan: current
        ? {
            dayCount: current.plan.dayCount,
            startDate: current.plan.startDate,
            timezoneName: current.plan.timezoneName,
            sessions: current.plan.sessions.map((session, sessionIndex) => ({
              clientId: `saved-session-${sessionIndex}`,
              localDate: session.localDate,
              title: session.title,
              sport: session.sport,
              intent: session.intent ?? "",
              expectedDurationMinutes: session.expectedDurationMinutes,
              note: session.note ?? "",
              isLocked: session.isLocked,
              activities: session.activities.map((activity, activityIndex) => ({
                clientId: `saved-activity-${sessionIndex}-${activityIndex}`,
                personalActivityId: activity.personalActivityId,
                name: activity.name,
                sport: activity.sport,
                instructions: activity.instructions ?? "",
                measurementMode: activity.measurementMode as MeasurementMode,
                target: activity.target as Record<
                  string,
                  string | number | boolean | undefined
                >,
                isLocked: activity.isLocked,
              })),
            })),
          }
        : null,
      expectedRevision: current?.head.revision ?? 0,
      versionNumber: current?.version.versionNumber ?? null,
      personalActivities: personalActivities.map((activity) => ({
        id: activity.id,
        name: activity.name,
        sport: activity.sport,
        description: activity.description,
        measurementMode: activity.measurementMode as MeasurementMode,
        ...(activity.defaultMeasurement === null
          ? {}
          : {
              defaultMeasurement: activity.defaultMeasurement as Record<
                string,
                string | number | boolean | undefined
              >,
            }),
      })),
    };
  } catch (error) {
    if (
      error instanceof TrainingRecordAuthenticationError &&
      error.accessError?.reason === "not-owner"
    ) {
      redirect("/auth/denied");
    }
    if (error instanceof TrainingRecordAuthenticationError) {
      redirect("/");
    }
    throw error;
  }

  return <PlanEditor initialState={initialState} />;
}
