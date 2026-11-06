import { AppSettingsForm } from "@/components/profile/profile-forms";
import { readOwnProfile, SettingPage } from "../settings-page";

export const dynamic = "force-dynamic";

/**
 * The units and the time zone, which setup takes from the browser without
 * asking (owner, 5 Oct 2026). Named for what it holds, not "App settings":
 * every page here is one (owner, 6 Nov 2026).
 */
export default async function UnitsAndTimeZonePage() {
  const details = await readOwnProfile((profiles) => profiles.getDetails());
  return (
    <SettingPage title="Units and time zone">
      <AppSettingsForm profile={details} />
    </SettingPage>
  );
}
