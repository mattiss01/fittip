import { CoachingSettings } from "@/components/profile/coaching-settings";
import { readOwnProfile, SettingPage } from "../settings-page";

export const dynamic = "force-dynamic";

/**
 * How hard the coach pushes, on a row of its own (owner, 12 Nov 2026), saved
 * as the slider settles.
 */
export default async function CoachingStylePage() {
  const details = await readOwnProfile((profiles) => profiles.getDetails());
  return (
    <SettingPage title="Coaching style">
      <CoachingSettings initial={details.training.pushLevel} />
    </SettingPage>
  );
}
