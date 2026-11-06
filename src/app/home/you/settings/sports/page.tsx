import { SportList } from "@/components/sports/sport-list";
import { readOwnProfile, SettingPage } from "../settings-page";

export const dynamic = "force-dynamic";

/**
 * The owner's own sports with their colours (owner, 6 Nov 2026), not setup's
 * catalogue.
 */
export default async function YourSportsPage() {
  const details = await readOwnProfile((profiles) => profiles.getDetails());
  return (
    <SettingPage title="Your sports">
      <SportList sports={details.ownedSports} />
    </SettingPage>
  );
}
