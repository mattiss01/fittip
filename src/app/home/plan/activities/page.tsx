import { redirect } from "next/navigation";

import { ActivityLibrary, type PersonalActivityView } from "./activity-library";

import homeStyles from "../../home.module.css";
import { SubPageHeader } from "../sub-page-header";
import type { PersonalActivity } from "@/server/personal-activities/personal-activities";
import {
  createPersonalActivityLibrary,
  PersonalActivityAuthenticationError,
} from "@/server/repositories/personal-activity-repository";

export const dynamic = "force-dynamic";

export default async function PersonalActivitiesPage() {
  let activities: PersonalActivity[];
  try {
    activities = await (await createPersonalActivityLibrary()).list();
  } catch (error) {
    if (error instanceof PersonalActivityAuthenticationError) {
      if (error.accessError?.reason === "not-owner") redirect("/auth/denied");
      redirect("/");
    }
    throw error;
  }

  return (
    <main className={homeStyles.shell} id="main-content">
      {/* As on the Session Library: what survives is that an activity added
          to a session is a copy. */}
      <SubPageHeader
        title="Activity Library"
        line="Adding one copies it. Changing it here changes nothing already planned, saved or logged."
        aside={`${activities.length} saved`}
      />
      <ActivityLibrary activities={activities.map(toView)} />
    </main>
  );
}

/** Only what the surface renders crosses to the client. */
function toView(activity: PersonalActivity): PersonalActivityView {
  return {
    id: activity.id,
    updatedAt: activity.updatedAt,
    name: activity.name,
    sport: activity.sport,
    instructions: activity.instructions ?? null,
    measurementMode: activity.measurementMode,
    target: activity.target ?? null,
  };
}
