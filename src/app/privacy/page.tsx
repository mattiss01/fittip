import type { Metadata } from "next";

import { LegalPage, readLegalReturn } from "@/components/legal/legal-page";
import { PRIVACY_NOTICE } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy notice · FitTip" };

/** Public, so it can be read before signing in (owner, 15 Nov 2026). */
export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return <LegalPage document={PRIVACY_NOTICE} from={readLegalReturn(from)} />;
}
