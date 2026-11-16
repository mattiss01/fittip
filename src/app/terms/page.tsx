import type { Metadata } from "next";

import { LegalPage, readLegalReturn } from "@/components/legal/legal-page";
import { TERMS } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms · FitTip" };

/** Public, so it can be read before signing in (owner, 15 Nov 2026). */
export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return <LegalPage document={TERMS} from={readLegalReturn(from)} />;
}
