import {
  AddWeightForm,
  WeightHistory,
} from "@/components/profile/profile-forms";
import { WeightChart } from "@/components/profile/weight-chart";
import { isoDateInTimezone } from "@/lib/date/local-date";
import { readOwnProfile, SettingPage } from "../../settings-page";

export const dynamic = "force-dynamic";

/**
 * The weight history, under About you (owner, 6 Nov 2026), where the latest
 * weight opens it: the weight over time, a weight added or a day corrected,
 * and every entry newest first, each one removable.
 */
export default async function WeightHistoryPage() {
  const [details, weights] = await readOwnProfile(async (profiles) => {
    const [found, entries] = await Promise.all([
      profiles.getDetails(),
      profiles.listWeightEntries(),
    ]);
    return found === null ? null : ([found, entries] as const);
  });
  const unitsSystem = details.unitsSystem ?? "metric";
  // The owner's own day, so a weight for today is today wherever they are.
  const today = isoDateInTimezone(new Date(), details.timezoneName ?? "UTC");
  return (
    <SettingPage
      back={{ href: "/home/you/settings/about", label: "About you" }}
      title="Weight history"
    >
      <WeightChart entries={weights} unitsSystem={unitsSystem} />
      <AddWeightForm today={today} unitsSystem={unitsSystem} />
      <WeightHistory entries={weights} unitsSystem={unitsSystem} />
    </SettingPage>
  );
}
