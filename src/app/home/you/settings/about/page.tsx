import { AboutYouForm } from "@/components/profile/profile-forms";
import { readOwnProfile, SettingPage } from "../settings-page";

export const dynamic = "force-dynamic";

/** About you: the owner's name, birthday, gender, height and weight. */
export default async function AboutYouPage() {
  const details = await readOwnProfile((profiles) => profiles.getDetails());
  return (
    <SettingPage title="About you">
      <AboutYouForm profile={details} submitLabel="Save" />
    </SettingPage>
  );
}
