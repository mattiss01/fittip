import { WeightHistory } from "@/components/profile/profile-forms";
import { readOwnProfile, SettingPage } from "../settings-page";

export const dynamic = "force-dynamic";

/** Every weight the owner recorded, newest first, each one removable. */
export default async function WeightHistoryPage() {
  const [details, weights] = await readOwnProfile(async (profiles) => {
    const [found, entries] = await Promise.all([
      profiles.getDetails(),
      profiles.listWeightEntries(),
    ]);
    return found === null ? null : ([found, entries] as const);
  });
  return (
    <SettingPage title="Weight history">
      <WeightHistory
        entries={weights}
        unitsSystem={details.unitsSystem ?? "metric"}
      />
    </SettingPage>
  );
}
