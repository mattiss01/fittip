/**
 * PROTOTYPE — logging a session: today's one form against two ways of asking
 * one question at a time, switchable with ?variant=A|B|C. Example session
 * only, no account needed, nothing is saved. Throwaway: lives on the
 * prototype/log-in-steps branch and never merges to master.
 */

import { notFound } from "next/navigation";

import { VariantA, name as nameA } from "./variant-a";
import { VariantB, name as nameB } from "./variant-b";
import { VariantC, name as nameC } from "./variant-c";

import { PrototypeSwitcher } from "@/components/prototype/prototype-switcher";

type Props = { searchParams: Promise<{ variant?: string | string[] }> };

const VARIANTS = [
  { key: "A", name: nameA },
  { key: "B", name: nameB },
  { key: "C", name: nameC },
];

export default async function PrototypeLogPage({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const raw = (await searchParams).variant;
  const variant = (Array.isArray(raw) ? raw[0] : raw)?.toUpperCase() ?? "A";

  return (
    <>
      {variant === "B" ? (
        <VariantB key="B" />
      ) : variant === "C" ? (
        <VariantC key="C" />
      ) : (
        <VariantA key="A" />
      )}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </>
  );
}
