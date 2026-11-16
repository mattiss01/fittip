import { CoachConsentSettings } from "@/components/consent/coach-consent-settings";
import { CoachNotice } from "@/components/consent/coach-notice";
import { createConsents } from "@/server/repositories/consent-repository";
import { readOwnProfile, SettingPage } from "../settings-page";

export const dynamic = "force-dynamic";

/**
 * Coach and your data (ADR-043 decision 5): the notice, the decision in
 * force, and the way to change it. Asked first in the dialog after sign-in
 * (owner, 12 Nov 2026); decided or not, it is changed here.
 */
export default async function CoachDataPage() {
  const profile = await readOwnProfile((profiles) =>
    profiles.getCurrentProfile(),
  );
  const consent = await (await createConsents()).current("coach");

  const status =
    consent.status === "undecided"
      ? "Not decided yet. The coach is off until you agree."
      : `${consent.status === "agreed" ? "Agreed" : "Declined"} on ${formatDay(
          consent.decidedAt,
          profile.timezoneName,
        )}.${consent.status === "agreed" ? "" : " The coach is off."}`;

  return (
    <SettingPage title="Coach and your data">
      <CoachNotice showTitle={false} />
      <CoachConsentSettings status={consent.status} statusText={status} />
    </SettingPage>
  );
}

/** The day a decision was made, in the person's own zone where known. */
function formatDay(iso: string, timezoneName: string | null): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: timezoneName ?? "UTC",
  }).format(new Date(iso));
}
