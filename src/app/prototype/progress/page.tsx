/**
 * PROTOTYPE — eight ways to redesign Progress around "am I following my plan?"
 * and "is it working?", switchable with ?variant=A–H. Every number comes from
 * Lena's local test record, exported into `lena.json`; no account is needed and
 * nothing is saved. Throwaway: lives on the prototype/progress branch and
 * never merges to master.
 */

import { notFound } from "next/navigation";

import { PrototypeSwitcher } from "./switcher";
import { Host } from "./host";

type Props = { searchParams: Promise<{ variant?: string | string[] }> };

const VARIANTS = [
  { key: "A", name: "One page of answers" },
  { key: "B", name: "Goal first" },
  { key: "C", name: "Tabs" },
  { key: "D", name: "Week review" },
  { key: "E", name: "Calendar" },
  { key: "F", name: "By sport" },
  { key: "G", name: "Goals + tabs" },
  { key: "H", name: "Done, by sport" },
];

export default async function PrototypeProgressPage({ searchParams }: Props) {
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
