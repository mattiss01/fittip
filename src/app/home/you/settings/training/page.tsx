import { TrainingSettings } from "@/components/profile/training-settings";
import { readOwnProfile, SettingPage } from "../settings-page";

export const dynamic = "force-dynamic";

/**
 * How often, which days are out, where, and with what (6 Oct 2026), each part
 * saved as it changes (owner, 6 Nov 2026).
 */
export default async function TrainingSetupPage() {
  const details = await readOwnProfile((profiles) => profiles.getDetails());
  return (
    <SettingPage title="Training setup">
      <TrainingSettings training={details.training} />
    </SettingPage>
  );
}
