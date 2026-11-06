import { ChangePassword } from "@/components/profile/change-password";
import { readOwnProfile, SettingPage } from "../settings-page";

export const dynamic = "force-dynamic";

/**
 * Changing the password while signed in (owner, 6 Nov 2026; ADR-042). A
 * change lands back on Settings, which says so; a refusal comes back here.
 */
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  await readOwnProfile((profiles) => profiles.getCurrentProfile());
  return (
    <SettingPage title="Change password">
      <ChangePassword refusal={typeof error === "string" ? error : null} />
    </SettingPage>
  );
}
