import { DeleteAccount } from "@/components/profile/delete-account";
import { readOwnProfile, SettingPage } from "../settings-page";

export const dynamic = "force-dynamic";

/**
 * Deleting the account (owner, 23 Oct 2026; ADR-039), a page of its own at
 * the end of Settings. A refusal comes back here in the address.
 */
export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ delete?: string }>;
}) {
  const { delete: refusal } = await searchParams;
  await readOwnProfile((profiles) => profiles.getCurrentProfile());
  return (
    <SettingPage title="Delete account">
      <DeleteAccount refusal={typeof refusal === "string" ? refusal : null} />
    </SettingPage>
  );
}
