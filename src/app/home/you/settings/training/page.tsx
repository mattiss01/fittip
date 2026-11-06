import { TrainingSetupForm } from "@/components/profile/training-forms";
import { readOwnProfile, SettingPage } from "../settings-page";

export const dynamic = "force-dynamic";

/** How often, which days are out, where, and with what (6 Oct 2026). */
export default async function TrainingSetupPage() {
  const details = await readOwnProfile((profiles) => profiles.getDetails());
  return (
    <SettingPage title="Training setup">
      <TrainingSetupForm training={details.training} />
    </SettingPage>
  );
}
