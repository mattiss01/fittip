import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Recurrence creation now belongs to the unified Plan-level session flow. */
export default function LegacySeriesCreationPage() {
  redirect("/home/plan");
}
