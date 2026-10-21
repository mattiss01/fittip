/**
 * PROTOTYPE — logging a session live: three ways to show the workout while it
 * happens, switchable with ?variant=A|B|C. Start, resume, finish and the
 * hand-over to the log are shared; the live screen is what differs. Example
 * sessions only, no account needed, nothing is saved. Throwaway: lives on the
 * prototype/live-workout branch and never merges to master.
 */

import { notFound } from "next/navigation";

import { Host } from "./host";

import { PrototypeSwitcher } from "@/components/prototype/prototype-switcher";

type Props = { searchParams: Promise<{ variant?: string | string[] }> };

const VARIANTS = [
  { key: "A", name: "One list" },
  { key: "B", name: "One thing at a time" },
  { key: "C", name: "Clock first" },
];

export default async function PrototypeLivePage({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const raw = (await searchParams).variant;
  const variant = (Array.isArray(raw) ? raw[0] : raw)?.toUpperCase() ?? "A";

  return (
    <>
      <Host variant={variant} />
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </>
  );
}
